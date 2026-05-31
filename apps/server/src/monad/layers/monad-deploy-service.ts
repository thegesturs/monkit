import { type ChildProcess, execFile, spawn } from "node:child_process";
import keytar from "keytar";
import { SqlClient } from "@effect/sql";
import { Effect, Layer } from "effect";
import {
  classifyAbiFunctions,
  type CodegenContract,
  coerceArgs,
  compileProject,
  deployContract,
  detectPackageManager,
  findAbiFunction,
  getNetwork,
  hasFoundry,
  listCompiledContracts,
  type NetworkId,
  parseDevServerUrl,
  readArtifact,
  readContractFn,
  resolveContracts,
  resolveFrontend,
  stringifyContractResult,
  writeContractFn,
  writeFrontendBindings,
} from "@memoize/monad-core";

import {
  MonadDeployService,
  type CodegenResultInfo,
  type CompiledContractInfo,
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
    };
  }),
);
