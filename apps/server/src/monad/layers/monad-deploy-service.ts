import { type ChildProcess, execFile, spawn } from "node:child_process";
import keytar from "keytar";
import { SqlClient } from "@effect/sql";
import { Effect, Layer } from "effect";
import {
  compileProject,
  deployContract,
  getNetwork,
  hasFoundry,
  listCompiledContracts,
  type NetworkId,
  readArtifact,
} from "@memoize/monad-core";

import {
  MonadDeployService,
  type CompiledContractInfo,
  type DeployRecordRow,
  type DevnetStatusInfo,
} from "../services/monad-deploy-service.ts";

const SERVICE_NAME = "memoize";
const keychainAccountFor = (address: string) => `monad.wallet:${address}`;

const LOCAL_PORT = 8545;
const NETWORK_IDS: readonly NetworkId[] = ["local", "testnet", "mainnet"];

/** Module-level anvil handle — one local devnet per app instance. */
let anvil: ChildProcess | null = null;

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

    const compile = (projectId: string) =>
      Effect.gen(function* () {
        const root = yield* projectRoot(projectId);
        const foundryAvailable = yield* tryPromise(() => hasFoundry());
        if (!foundryAvailable) {
          return { foundryAvailable: false, contracts: [] };
        }
        yield* tryPromise(() => compileProject(root));
        const compiled = yield* tryPromise(() => listCompiledContracts(root));
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

        const foundryAvailable = yield* tryPromise(() => hasFoundry());
        if (!foundryAvailable) {
          return yield* Effect.fail(
            new Error("Foundry (forge) is not installed or not on PATH."),
          );
        }
        yield* tryPromise(() => compileProject(root));
        const artifact = yield* tryPromise(() =>
          readArtifact(root, input.contractName),
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

    return {
      compile,
      deploy,
      list,
      devnetStart,
      devnetStop,
      devnetStatus,
    };
  }),
);
