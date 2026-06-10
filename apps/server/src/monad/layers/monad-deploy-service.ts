import { type ChildProcess, execFile, spawn } from "node:child_process";
import { join } from "node:path";
import keytar from "keytar";
import { SqlClient } from "@effect/sql";
import { Effect, Layer, Mailbox, Stream } from "effect";
import {
  buildFrontend,
  classifyAbiFunctions,
  CLOUD_LOG_FILE,
  cloudLog,
  CloudCommandError,
  type CodegenContract,
  coerceArgs,
  compileProject,
  convexConnected,
  convexDevOnce,
  convexLogin,
  deployContract,
  detectPackageManager,
  ensureFrontendDeps,
  findAbiFunction,
  getNetwork,
  hasConvexCli,
  hasFoundry,
  hasVercelCli,
  listCompiledContracts,
  type NetworkId,
  parseDevServerUrl,
  readArtifact,
  readContractFn,
  resolveContracts,
  resolveFrontend,
  stringifyContractResult,
  vercelConnected,
  vercelDeployStatic,
  vercelLogin,
  writeContractFn,
  writeFrontendBindings,
} from "@memoize/monad-core";

import {
  MonadDeployService,
  type CloudConnectionStatus,
  type CloudDeployInput,
  type CloudDeployStage,
  type CloudDeployStepInfo,
  type CodegenResultInfo,
  type CompiledContractInfo,
  type ConnectEvent,
  type ContractFunctionsResult,
  type ContractReadInput,
  type ContractWriteInput,
  type ContractWriteResult,
  type DeployRecordRow,
  type DevnetStatusInfo,
  type FrontendStatusInfo,
} from "../services/monad-deploy-service.ts";

const SERVICE_NAME = "memoize";
const keychainAccountFor = (address: string) => `monad.wallet:${address}`;

const LOCAL_PORT = 8545;
const NETWORK_IDS: readonly NetworkId[] = ["local", "testnet", "mainnet"];

/** Module-level anvil handle — one local devnet per app instance. */
let anvil: ChildProcess | null = null;

/** Module-level frontend dev-server handle — one running frontend per app instance. */
let frontend: ChildProcess | null = null;
let frontendUrl: string | null = null;
let frontendPm: string | null = null;
let frontendProjectId: string | null = null;

function frontendStatusInfo(): FrontendStatusInfo {
  const running =
    frontend !== null && frontend.exitCode === null && !frontend.killed;
  return {
    running,
    url: running ? frontendUrl : null,
    pm: running ? frontendPm : null,
    projectId: running ? frontendProjectId : null,
  };
}

function killFrontend(): void {
  if (frontend !== null) {
    frontend.kill();
    frontend = null;
  }
  frontendUrl = null;
  frontendPm = null;
  frontendProjectId = null;
}

/** Poll until the dev server prints a localhost URL, or time out (returns null). */
async function waitForFrontendUrl(timeoutMs = 20_000): Promise<string | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (frontendUrl !== null) return frontendUrl;
    if (frontend === null || frontend.exitCode !== null) return null;
    await new Promise((r) => setTimeout(r, 200));
  }
  return null;
}

function asNetworkId(network: string): NetworkId {
  if ((NETWORK_IDS as readonly string[]).includes(network)) {
    return network as NetworkId;
  }
  throw new Error(`Unknown network: ${network}`);
}

/**
 * Coerce a UI-supplied string arg into the JS type viem expects for the ABI
 * type. (Args cross the wire as strings — BigInt can't be JSON-serialized.)
 */
function coerceArg(abiType: string, raw: unknown): unknown {
  if (typeof raw !== "string") return raw;
  if (abiType.endsWith("]") || abiType.startsWith("tuple")) {
    // arrays / tuples — expect JSON
    return JSON.parse(raw);
  }
  if (/^u?int\d*$/.test(abiType)) return BigInt(raw);
  if (abiType === "bool") return raw === "true" || raw === "1";
  // address, string, bytes* — pass through as string
  return raw;
}

function tryPromise<A>(thunk: () => Promise<A>) {
  return Effect.tryPromise({
    try: thunk,
    catch: (cause) =>
      cause instanceof Error ? cause : new Error(String(cause)),
  });
}

function localDevnetStatus(): DevnetStatusInfo {
  const running = anvil !== null && anvil.exitCode === null && !anvil.killed;
  return {
    running,
    port: running ? LOCAL_PORT : null,
    chainId: getNetwork("local").chainId,
    url: running ? `http://127.0.0.1:${LOCAL_PORT}` : null,
  };
}

function anvilAvailable(): Promise<boolean> {
  return new Promise((resolve) => {
    execFile("anvil", ["--version"], { timeout: 10_000 }, (err) =>
      resolve(err === null),
    );
  });
}

/** Wait until the local devnet answers eth_chainId, or time out. */
async function waitForDevnet(timeoutMs = 8_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  const url = `http://127.0.0.1:${LOCAL_PORT}`;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId" }),
      });
      if (res.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error("Local devnet did not become ready in time");
}

/**
 * Turn a Convex/Vercel CLI failure into a short, actionable message. The most
 * common cause is "not logged in" — the user fixes it by running the CLI's
 * login once in a terminal (we deliberately store no tokens).
 */
function classifyCloudError(
  stage: "convex" | "vercel",
  cause: unknown,
): string {
  const output =
    cause instanceof CloudCommandError
      ? cause.output
      : cause instanceof Error
        ? cause.message
        : String(cause);
  const lower = output.toLowerCase();
  if (stage === "convex") {
    // Missing deps — esbuild can't resolve `convex/server` etc. (scaffold
    // never ran install). The ship flow auto-installs now, so this is rare.
    if (
      /could not resolve|cannot find module|module not found|esbuild failed/.test(
        lower,
      )
    ) {
      return 'Convex couldn\'t bundle your functions — the frontend dependencies need installing. Click "Set up Convex" above (it installs them), then Ship again.';
    }
    // Local/anonymous backend, or Convex needs an INTERACTIVE prompt (link to
    // account / pick a team) to create a cloud one — a non-interactive ship
    // can't answer. Route to the one-time terminal setup, NOT "Connect" (the
    // user is already signed in). Note: "run npx convex login to link to a
    // project" is about LINKING, not auth — so it lives here.
    if (
      /no convex account|link to a project|127\.0\.0\.1|local.*deployment|cannot prompt|non-interactive|link your existing deployment|anonymous|select.*team|which team|configure|create a (new )?project/.test(
        lower,
      )
    ) {
      return 'Convex needs its one-time cloud setup. Click "Set up Convex" above and finish the prompt in the terminal, then Ship again.';
    }
    if (/not logged in|not authenticated/.test(lower)) {
      return "Not connected to Convex — use Connect Convex above, then retry.";
    }
  } else {
    if (/no existing credentials|please run ['"`]?vercel login|not authenticated/.test(lower)) {
      return "Not connected to Vercel — use Connect Vercel above, then retry.";
    }
  }
  // Fall back to the last few non-empty lines of real output so the actual
  // failure is never hidden behind a guessed message.
  const lines = output
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l !== "");
  const tail = lines.slice(-4).join("\n");
  return tail !== "" ? tail : `${stage} deploy failed.`;
}

export const MonadDeployServiceLive = Layer.effect(
  MonadDeployService,
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;

    const projectRoot = (projectId: string) =>
      Effect.gen(function* () {
        const rows = yield* sql<{ path: string }>`
          SELECT path FROM projects WHERE id = ${projectId} LIMIT 1
        `;
        const root = rows[0]?.path;
        if (root == null) {
          return yield* Effect.fail(new Error(`Unknown project: ${projectId}`));
        }
        return root;
      });

    /**
     * Rebuild the frontend binding files for a project from the full deploy
     * history (every chainId an address was deployed to) plus the freshest
     * compiled ABIs. Rendering wholesale means re-deploys preserve other
     * networks and overwrite only what changed. No-ops cleanly when the
     * project has no frontend package.
     */
    const gatherBindings = (projectId: string, root: string) =>
      Effect.gen(function* () {
        const resolved = yield* tryPromise(() => resolveFrontend(root));
        if (!resolved.exists) {
          return {
            written: [],
            skipped: [],
            frontendMissing: true,
          } satisfies CodegenResultInfo;
        }

        // Fresh ABIs from a build; fall back to whatever's already in out/ if
        // the build fails (e.g. a transient compile error) so codegen still
        // updates addresses.
        const { foundryRoot, outDir } = yield* tryPromise(() =>
          resolveContracts(root),
        );
        const compiled = yield* tryPromise(async () => {
          if (!(await hasFoundry())) return [];
          try {
            await compileProject(foundryRoot);
          } catch {
            // fall through to whatever artifacts exist
          }
          return listCompiledContracts(outDir);
        }).pipe(Effect.catchAll(() => Effect.succeed([] as never[])));

        const abiByName = new Map<string, CodegenContract["abi"]>();
        for (const c of compiled) abiByName.set(c.name, c.abi);

        // Oldest-first so a re-deploy to the same chain overwrites the earlier
        // address for that (contract, chainId).
        const rows = yield* sql<{
          network: string;
          contractName: string;
          address: string;
        }>`
          SELECT network, contract_name AS contractName, address
          FROM monad_deploys
          WHERE project_id = ${projectId}
          ORDER BY deployed_at ASC
        `;

        const addrByName = new Map<string, Map<number, string>>();
        for (const row of rows) {
          let chainId: number;
          try {
            chainId = getNetwork(asNetworkId(row.network)).chainId;
          } catch {
            continue; // unknown network label — skip rather than poison output
          }
          const row2 = addrByName.get(row.contractName) ?? new Map();
          row2.set(chainId, row.address);
          addrByName.set(row.contractName, row2);
        }

        const names = new Set<string>([
          ...abiByName.keys(),
          ...addrByName.keys(),
        ]);
        const contracts: CodegenContract[] = [...names].map((name) => ({
          name,
          abi: abiByName.get(name) ?? [],
          addresses: [...(addrByName.get(name)?.entries() ?? [])].map(
            ([chainId, address]) => ({
              chainId,
              address: address as `0x${string}`,
            }),
          ),
        }));

        const result = yield* tryPromise(() =>
          writeFrontendBindings({
            contractsDir: resolved.contractsDir,
            contracts,
          }),
        );
        return {
          written: result.written,
          skipped: result.skipped,
          frontendMissing: false,
        } satisfies CodegenResultInfo;
      });

    const compile = (projectId: string) =>
      Effect.gen(function* () {
        const root = yield* projectRoot(projectId);
        const { foundryRoot, outDir } = yield* tryPromise(() =>
          resolveContracts(root),
        );
        const foundryAvailable = yield* tryPromise(() => hasFoundry());
        if (!foundryAvailable) {
          return { foundryAvailable: false, contracts: [] };
        }
        yield* tryPromise(() => compileProject(foundryRoot));
        const compiled = yield* tryPromise(() => listCompiledContracts(outDir));
        const contracts: CompiledContractInfo[] = compiled.map((c) => {
          const ctor = c.abi.find(
            (entry) => (entry as { type?: string }).type === "constructor",
          ) as
            | { inputs?: readonly { name?: string; type?: string }[] }
            | undefined;
          return {
            name: c.name,
            constructorInputs: (ctor?.inputs ?? []).map((input, i) => ({
              name: input.name && input.name !== "" ? input.name : `arg${i}`,
              type: input.type ?? "string",
            })),
          };
        });
        return { foundryAvailable: true, contracts };
      });

    const deploy = (input: {
      projectId: string;
      contractName: string;
      constructorArgs: readonly unknown[];
      network: string;
    }) =>
      Effect.gen(function* () {
        const networkId = yield* Effect.try({
          try: () => asNetworkId(input.network),
          catch: (c) => (c instanceof Error ? c : new Error(String(c))),
        });
        const root = yield* projectRoot(input.projectId);
        const { foundryRoot, outDir } = yield* tryPromise(() =>
          resolveContracts(root),
        );

        const foundryAvailable = yield* tryPromise(() => hasFoundry());
        if (!foundryAvailable) {
          return yield* Effect.fail(
            new Error("Foundry (forge) is not installed or not on PATH."),
          );
        }
        yield* tryPromise(() => compileProject(foundryRoot));
        const artifact = yield* tryPromise(() =>
          readArtifact(outDir, input.contractName),
        );

        // Coerce string args to the JS types viem expects per the ABI.
        const ctor = artifact.abi.find(
          (entry) => (entry as { type?: string }).type === "constructor",
        ) as { inputs?: readonly { type?: string }[] } | undefined;
        const ctorInputs = ctor?.inputs ?? [];
        const coercedArgs = yield* Effect.try({
          try: () =>
            input.constructorArgs.map((arg, i) =>
              coerceArg(ctorInputs[i]?.type ?? "string", arg),
            ),
          catch: (c) =>
            new Error(
              `Invalid constructor argument: ${c instanceof Error ? c.message : String(c)}`,
            ),
        });

        // Sign with the most recent burner wallet.
        const wallets = yield* sql<{ address: string }>`
          SELECT address FROM monad_wallets ORDER BY created_at DESC LIMIT 1
        `;
        const address = wallets[0]?.address;
        if (address == null) {
          return yield* Effect.fail(
            new Error("No wallet found — create a burner wallet first."),
          );
        }
        const pk = yield* tryPromise(() =>
          keytar.getPassword(SERVICE_NAME, keychainAccountFor(address)),
        );
        if (pk == null) {
          return yield* Effect.fail(
            new Error(`No private key in keychain for ${address}`),
          );
        }

        const result = yield* tryPromise(() =>
          deployContract({
            networkId,
            privateKey: pk as `0x${string}`,
            abi: artifact.abi,
            bytecode: artifact.bytecode,
            args: coercedArgs,
          }),
        );

        const id = crypto.randomUUID();
        const now = new Date().toISOString();
        const blockNumber =
          result.blockNumber === null ? null : Number(result.blockNumber);
        const argsJson =
          input.constructorArgs.length > 0
            ? JSON.stringify(input.constructorArgs)
            : null;

        yield* sql`
          INSERT INTO monad_deploys
            (id, project_id, network, contract_name, address, tx_hash, block_number, constructor_args_json, deployed_at)
          VALUES
            (${id}, ${input.projectId}, ${input.network}, ${input.contractName}, ${result.address}, ${result.txHash}, ${blockNumber}, ${argsJson}, ${now})
        `;

        // Auto-wire the frontend bindings. Best-effort — a codegen failure must
        // never fail an otherwise-successful deploy (the contract is already
        // on-chain and recorded). We log and move on.
        yield* gatherBindings(input.projectId, root).pipe(
          Effect.catchAll((cause) =>
            Effect.logWarning(
              `codegen after deploy failed: ${cause instanceof Error ? cause.message : String(cause)}`,
            ),
          ),
        );

        return {
          id,
          projectId: input.projectId,
          network: input.network,
          contractName: input.contractName,
          address: result.address,
          txHash: result.txHash,
          blockNumber,
          constructorArgsJson: argsJson,
          deployedAt: now,
        } satisfies DeployRecordRow;
      });

    const list = (projectId: string) =>
      Effect.gen(function* () {
        const rows = yield* sql<DeployRecordRow>`
          SELECT
            id,
            project_id      AS projectId,
            network,
            contract_name   AS contractName,
            address,
            tx_hash         AS txHash,
            block_number    AS blockNumber,
            constructor_args_json AS constructorArgsJson,
            deployed_at     AS deployedAt
          FROM monad_deploys
          WHERE project_id = ${projectId}
          ORDER BY deployed_at DESC
        `;
        return rows;
      });

    const devnetStart = () =>
      Effect.gen(function* () {
        if (localDevnetStatus().running) return localDevnetStatus();

        const available = yield* tryPromise(() => anvilAvailable());
        if (!available) {
          return yield* Effect.fail(
            new Error(
              "anvil not found — install Foundry to run a local devnet.",
            ),
          );
        }

        anvil = spawn(
          "anvil",
          [
            "--chain-id",
            String(getNetwork("local").chainId),
            "--port",
            String(LOCAL_PORT),
            "--silent",
          ],
          { stdio: "ignore" },
        );
        anvil.on("exit", () => {
          anvil = null;
        });

        yield* tryPromise(() => waitForDevnet());
        return localDevnetStatus();
      });

    const devnetStop = () =>
      Effect.sync(() => {
        if (anvil !== null) {
          anvil.kill();
          anvil = null;
        }
      });

    const devnetStatus = () => Effect.sync(() => localDevnetStatus());

    const regenerateBindings = (projectId: string) =>
      Effect.gen(function* () {
        const root = yield* projectRoot(projectId);
        return yield* gatherBindings(projectId, root);
      });

    const frontendStart = (projectId: string) =>
      Effect.gen(function* () {
        const root = yield* projectRoot(projectId);
        const resolved = yield* tryPromise(() => resolveFrontend(root));
        if (!resolved.exists) {
          return yield* Effect.fail(
            new Error("This project has no frontend package to run."),
          );
        }

        const current = frontendStatusInfo();
        if (current.running && frontendProjectId === projectId) return current;
        // A different project's server is running — replace it.
        if (current.running) killFrontend();

        const pm = yield* tryPromise(() =>
          detectPackageManager(resolved.frontendDir),
        );

        const child = spawn(pm, ["run", "dev"], {
          cwd: resolved.frontendDir,
          stdio: ["ignore", "pipe", "pipe"],
        });
        frontend = child;
        frontendUrl = null;
        frontendPm = pm;
        frontendProjectId = projectId;

        const onData = (buf: Buffer) => {
          if (frontendUrl === null) {
            const url = parseDevServerUrl(buf.toString());
            if (url !== null) frontendUrl = url;
          }
        };
        child.stdout?.on("data", onData);
        child.stderr?.on("data", onData);
        child.on("exit", () => {
          if (frontend === child) killFrontend();
        });

        yield* tryPromise(() => waitForFrontendUrl());
        return frontendStatusInfo();
      });

    const frontendStop = () =>
      Effect.sync(() => {
        killFrontend();
        return frontendStatusInfo();
      });

    const frontendStatus = () => Effect.sync(() => frontendStatusInfo());

    /** The most-recent burner wallet's private key, from the OS keychain. */
    const loadSignerKey = () =>
      Effect.gen(function* () {
        const wallets = yield* sql<{ address: string }>`
          SELECT address FROM monad_wallets ORDER BY created_at DESC LIMIT 1
        `;
        const address = wallets[0]?.address;
        if (address == null) {
          return yield* Effect.fail(
            new Error("No wallet found — create a burner wallet first."),
          );
        }
        const pk = yield* tryPromise(() =>
          keytar.getPassword(SERVICE_NAME, keychainAccountFor(address)),
        );
        if (pk == null) {
          return yield* Effect.fail(
            new Error(`No private key in keychain for ${address}`),
          );
        }
        return pk as `0x${string}`;
      });

    /**
     * The compiled ABI for a contract by name. We build first (best-effort) so
     * a freshly-edited contract's ABI is current, then read the artifact.
     */
    const loadAbi = (projectId: string, contractName: string) =>
      Effect.gen(function* () {
        const root = yield* projectRoot(projectId);
        const { foundryRoot, outDir } = yield* tryPromise(() =>
          resolveContracts(root),
        );
        const available = yield* tryPromise(() => hasFoundry());
        if (available) {
          yield* tryPromise(() => compileProject(foundryRoot)).pipe(
            Effect.catchAll(() => Effect.void),
          );
        }
        const artifact = yield* tryPromise(() =>
          readArtifact(outDir, contractName),
        );
        return artifact.abi;
      });

    const contractFunctions = (projectId: string, contractName: string) =>
      Effect.gen(function* () {
        const abi = yield* loadAbi(projectId, contractName);
        return classifyAbiFunctions(abi) satisfies ContractFunctionsResult;
      });

    const contractRead = (input: ContractReadInput) =>
      Effect.gen(function* () {
        const networkId = yield* Effect.try({
          try: () => asNetworkId(input.network),
          catch: (c) => (c instanceof Error ? c : new Error(String(c))),
        });
        const abi = yield* loadAbi(input.projectId, input.contractName);
        const fn = findAbiFunction(abi, input.functionName);
        if (fn === null) {
          return yield* Effect.fail(
            new Error(`No function "${input.functionName}" on this contract.`),
          );
        }
        const args = yield* Effect.try({
          try: () => coerceArgs(fn, input.args),
          catch: (c) =>
            new Error(
              `Invalid argument: ${c instanceof Error ? c.message : String(c)}`,
            ),
        });
        const value = yield* tryPromise(() =>
          readContractFn({
            networkId,
            address: input.address as `0x${string}`,
            abi,
            functionName: input.functionName,
            args,
          }),
        );
        return { result: stringifyContractResult(value) };
      });

    const contractWrite = (input: ContractWriteInput) =>
      Effect.gen(function* () {
        const networkId = yield* Effect.try({
          try: () => asNetworkId(input.network),
          catch: (c) => (c instanceof Error ? c : new Error(String(c))),
        });
        const abi = yield* loadAbi(input.projectId, input.contractName);
        const fn = findAbiFunction(abi, input.functionName);
        if (fn === null) {
          return yield* Effect.fail(
            new Error(`No function "${input.functionName}" on this contract.`),
          );
        }
        const args = yield* Effect.try({
          try: () => coerceArgs(fn, input.args),
          catch: (c) =>
            new Error(
              `Invalid argument: ${c instanceof Error ? c.message : String(c)}`,
            ),
        });
        const value = yield* Effect.try({
          try: () =>
            input.value != null && input.value !== ""
              ? BigInt(input.value)
              : undefined,
          catch: () => new Error(`Invalid value: ${input.value}`),
        });
        const pk = yield* loadSignerKey();
        const result = yield* tryPromise(() =>
          writeContractFn({
            networkId,
            privateKey: pk,
            address: input.address as `0x${string}`,
            abi,
            functionName: input.functionName,
            args,
            value,
          }),
        );
        return {
          txHash: result.txHash,
          blockNumber:
            result.blockNumber === null ? null : Number(result.blockNumber),
          status: result.status,
        } satisfies ContractWriteResult;
      });

    const cloudDeploy = (
      input: CloudDeployInput,
    ): Stream.Stream<CloudDeployStepInfo, Error> =>
      Stream.async<CloudDeployStepInfo, Error>((emit) => {
        const event = (
          stage: CloudDeployStage,
          status: CloudDeployStepInfo["status"],
          extra?: Partial<CloudDeployStepInfo>,
        ) => {
          // Mirror every step (esp. failures) into the debug log.
          if (status !== "started" || extra?.log == null) {
            void cloudLog(
              `cloudDeploy[${stage}] ${status}${extra?.log != null ? `: ${extra.log}` : ""}`,
            );
          }
          void emit.single({
            stage,
            status,
            log: null,
            convexUrl: null,
            contractAddress: null,
            shareUrl: null,
            ...extra,
          });
        };

        // Which stages to run — omitted flags default to enabled (full ship).
        const stages = {
          contract: input.stages?.contract ?? true,
          convex: input.stages?.convex ?? true,
          publish: input.stages?.publish ?? true,
        };
        void cloudLog(
          `=== cloudDeploy start project=${input.projectId} contract=${input.contractName} stages=${JSON.stringify(stages)}`,
        );

        void (async () => {
          try {
            if (!stages.contract && !stages.convex && !stages.publish) {
              emit.fail(new Error("Nothing selected to deploy."));
              return;
            }

            const root = await Effect.runPromise(projectRoot(input.projectId));
            const resolved = await resolveFrontend(root);
            // Convex + publish need the frontend package; a contract-only run
            // doesn't.
            if ((stages.convex || stages.publish) && !resolved.exists) {
              const msg = "This project has no frontend package to deploy.";
              event("build", "failed", { log: msg });
              emit.fail(new Error(msg));
              return;
            }
            const frontendDir = resolved.frontendDir;

            let contractAddress: string | null = null;
            let convexUrl: string | null = null;
            let shareUrl: string | null = null;

            // Step 1 — deploy the contract to testnet (also auto-codegens the
            // frontend bindings, so addresses are baked in before the build).
            if (stages.contract) {
              event("deploy-contract", "started");
              const record = await Effect.runPromise(
                deploy({
                  projectId: input.projectId,
                  contractName: input.contractName,
                  constructorArgs: input.constructorArgs,
                  network: "testnet",
                }),
              );
              contractAddress = record.address;
              event("deploy-contract", "succeeded", { contractAddress });
            }

            const pm = await detectPackageManager(frontendDir);

            // Scaffolded projects ship without node_modules, which makes both
            // `convex dev` (can't resolve `convex/server`) and the Vite build
            // fail. Install once up front when anything needs the frontend.
            if (stages.convex || stages.publish) {
              try {
                const { installed } = await ensureFrontendDeps({
                  frontendDir,
                  pm,
                  onLog: (line) =>
                    event("convex", "started", { log: line }),
                });
                if (installed) void cloudLog("installed frontend deps");
              } catch (cause) {
                const msg =
                  cause instanceof CloudCommandError
                    ? cause.output.split(/\r?\n/).slice(-20).join("\n")
                    : cause instanceof Error
                      ? cause.message
                      : String(cause);
                event("convex", "failed", {
                  log: `Couldn't install frontend dependencies:\n${msg}`,
                });
                emit.fail(new Error("Couldn't install frontend dependencies."));
                return;
              }
            }

            // Step 2 — push the Convex backend to its cloud dev deployment.
            if (stages.convex) {
              event("convex", "started");
              if (!(await hasConvexCli(frontendDir, pm))) {
                const msg =
                  "Convex CLI not found in the frontend package — run `bun install` (or your package manager) first.";
                event("convex", "failed", { log: msg });
                emit.fail(new Error(msg));
                return;
              }
              try {
                const result = await convexDevOnce({
                  frontendDir,
                  pm,
                  onLog: (line) => event("convex", "started", { log: line }),
                });
                convexUrl = result.url;
              } catch (cause) {
                const msg = classifyCloudError("convex", cause);
                event("convex", "failed", { log: msg });
                emit.fail(new Error(msg));
                return;
              }
              // A local/anonymous backend (127.0.0.1) isn't reachable by a
              // published app — require a shareable cloud deployment.
              if (/127\.0\.0\.1|localhost/.test(convexUrl)) {
                const msg =
                  'Convex is on a local backend, which a published app can\'t reach. Click "Set up Convex" above to create a shareable cloud backend, then Ship again.';
                event("convex", "failed", { log: msg });
                emit.fail(new Error(msg));
                return;
              }
              event("convex", "succeeded", { convexUrl });
            }

            if (stages.publish) {
              // Step 3 — build the frontend (Vite inlines VITE_CONVEX_URL +
              // contract addresses from the prior two steps).
              event("build", "started");
              try {
                await buildFrontend({
                  frontendDir,
                  pm,
                  onLog: (line) => event("build", "started", { log: line }),
                });
              } catch (cause) {
                const msg =
                  cause instanceof CloudCommandError
                    ? cause.output.split(/\r?\n/).slice(-30).join("\n")
                    : cause instanceof Error
                      ? cause.message
                      : String(cause);
                event("build", "failed", { log: msg });
                emit.fail(new Error("Frontend build failed."));
                return;
              }
              event("build", "succeeded");

              // Step 4 — publish the static build to Vercel.
              event("vercel", "started");
              if (!(await hasVercelCli())) {
                const msg =
                  "Vercel CLI not found — install it with `npm i -g vercel`, then retry.";
                event("vercel", "failed", { log: msg });
                emit.fail(new Error(msg));
                return;
              }
              try {
                const result = await vercelDeployStatic({
                  distDir: join(frontendDir, "dist"),
                  onLog: (line) => event("vercel", "started", { log: line }),
                });
                shareUrl = result.url;
                // Persist the public URL so the share box survives reloads.
                await Effect.runPromise(
                  sql`
                    INSERT INTO monad_published
                      (project_id, url, deployment_url, updated_at)
                    VALUES
                      (${input.projectId}, ${result.url}, ${result.deploymentUrl}, ${new Date().toISOString()})
                    ON CONFLICT(project_id) DO UPDATE SET
                      url = excluded.url,
                      deployment_url = excluded.deployment_url,
                      updated_at = excluded.updated_at
                  `.pipe(Effect.catchAll(() => Effect.void)),
                );
              } catch (cause) {
                const msg = classifyCloudError("vercel", cause);
                event("vercel", "failed", { log: msg });
                emit.fail(new Error(msg));
                return;
              }
              event("vercel", "succeeded");
            }

            event("done", "succeeded", { shareUrl, contractAddress, convexUrl });
            emit.end();
          } catch (cause) {
            const msg = cause instanceof Error ? cause.message : String(cause);
            void cloudLog(`!!! cloudDeploy crashed: ${msg}`);
            emit.fail(cause instanceof Error ? cause : new Error(msg));
          }
        })();
      }, 16_384);

    const publishedUrl = (projectId: string) =>
      Effect.gen(function* () {
        const rows = yield* sql<{
          url: string;
          deploymentUrl: string | null;
          updatedAt: string;
        }>`
          SELECT url, deployment_url AS deploymentUrl, updated_at AS updatedAt
          FROM monad_published WHERE project_id = ${projectId} LIMIT 1
        `;
        return rows[0] ?? null;
      });

    const cloudStatus = () =>
      Effect.gen(function* () {
        const convex = yield* tryPromise(() => convexConnected());
        const vercel = yield* tryPromise(() => vercelConnected());
        yield* tryPromise(() =>
          cloudLog(`cloudStatus convex=${convex} vercel=${vercel}`),
        );
        return { convex, vercel } satisfies CloudConnectionStatus;
      });

    /**
     * Drive a device-flow login and stream its progress. Mirrors the Cursor
     * login service: a Mailbox carries `url`/`log`/`done` events, and a scope
     * finalizer aborts the child if the renderer unsubscribes (panel closed).
     */
    const connectVercel = (): Stream.Stream<ConnectEvent, Error> =>
      Stream.unwrapScoped(
        Effect.gen(function* () {
          yield* tryPromise(() => cloudLog("=== connectVercel start"));
          const mailbox = yield* Mailbox.make<ConnectEvent>();
          const controller = new AbortController();
          vercelLogin({
            onUrl: (url) =>
              mailbox.unsafeOffer({ type: "url", url, log: null, ok: false }),
            onLog: (line) =>
              mailbox.unsafeOffer({
                type: "log",
                url: null,
                log: line,
                ok: false,
              }),
            signal: controller.signal,
          }).then(
            () => {
              mailbox.unsafeOffer({
                type: "done",
                url: null,
                log: null,
                ok: true,
              });
              void mailbox.end.pipe(Effect.runPromise);
            },
            (cause) => {
              mailbox.unsafeOffer({
                type: "done",
                url: null,
                log: cause instanceof Error ? cause.message : String(cause),
                ok: false,
              });
              void mailbox.end.pipe(Effect.runPromise);
            },
          );
          yield* Effect.addFinalizer(() =>
            Effect.sync(() => controller.abort()),
          );
          return Mailbox.toStream(mailbox) as Stream.Stream<ConnectEvent, Error>;
        }),
      );

    const connectConvex = (
      projectId: string,
    ): Stream.Stream<ConnectEvent, Error> =>
      Stream.unwrapScoped(
        Effect.gen(function* () {
          yield* tryPromise(() =>
            cloudLog(`=== connectConvex start project=${projectId}`),
          );
          const root = yield* projectRoot(projectId);
          const resolved = yield* tryPromise(() => resolveFrontend(root));
          if (!resolved.exists) {
            return Stream.fail(
              new Error("This project has no frontend package."),
            ) as Stream.Stream<ConnectEvent, Error>;
          }
          const pm = yield* tryPromise(() =>
            detectPackageManager(resolved.frontendDir),
          );
          const mailbox = yield* Mailbox.make<ConnectEvent>();
          const controller = new AbortController();
          convexLogin({
            frontendDir: resolved.frontendDir,
            pm,
            onUrl: (url) =>
              mailbox.unsafeOffer({ type: "url", url, log: null, ok: false }),
            onLog: (line) =>
              mailbox.unsafeOffer({
                type: "log",
                url: null,
                log: line,
                ok: false,
              }),
            signal: controller.signal,
          }).then(
            () => {
              mailbox.unsafeOffer({
                type: "done",
                url: null,
                log: null,
                ok: true,
              });
              void mailbox.end.pipe(Effect.runPromise);
            },
            (cause) => {
              mailbox.unsafeOffer({
                type: "done",
                url: null,
                log: cause instanceof Error ? cause.message : String(cause),
                ok: false,
              });
              void mailbox.end.pipe(Effect.runPromise);
            },
          );
          yield* Effect.addFinalizer(() =>
            Effect.sync(() => controller.abort()),
          );
          return Mailbox.toStream(mailbox) as Stream.Stream<ConnectEvent, Error>;
        }),
      );

    return {
      compile,
      deploy,
      list,
      devnetStart,
      devnetStop,
      devnetStatus,
      regenerateBindings,
      frontendStart,
      frontendStop,
      frontendStatus,
      contractFunctions,
      contractRead,
      contractWrite,
      cloudDeploy,
      cloudStatus,
      connectConvex,
      connectVercel,
      publishedUrl,
    };
  }),
);
