import { Rpc } from "@effect/rpc";
import { Schema } from "effect";

// Phase 1 minimal types (can be refined later)
export const NetworkIdSchema = Schema.Literal("local", "testnet", "mainnet");
export type NetworkId = typeof NetworkIdSchema.Type;

/**
 * Surfaced RPC failure for the Monad domain. We attach this as the `error`
 * channel of network calls so the renderer can show a real reason (and a
 * Retry affordance) instead of silently hanging on "connecting…".
 */
export class MonadRpcError extends Schema.TaggedError<MonadRpcError>()(
  "MonadRpcError",
  { message: Schema.String },
) {}

export class NetworkConfig extends Schema.Class<NetworkConfig>("NetworkConfig")(
  {
    id: NetworkIdSchema,
    chainId: Schema.Number,
    name: Schema.String,
    rpcUrl: Schema.String,
    explorerUrl: Schema.NullOr(Schema.String),
  },
) {}

export class BlockHeight extends Schema.Class<BlockHeight>("BlockHeight")({
  networkId: NetworkIdSchema,
  chainId: Schema.Number,
  // BigInt encoded as a string — JSON.stringify throws on a raw bigint, so
  // BigIntFromSelf can't cross the JSON RPC boundary. Schema.BigInt is bigint↔string.
  blockNumber: Schema.BigInt,
  updatedAt: Schema.DateFromString,
}) {}

// Requests
export const GetBlockNumberReq = Schema.Struct({
  networkId: Schema.optional(NetworkIdSchema),
});

export const GetActiveNetworkReq = Schema.Struct({});
export const SetActiveNetworkReq = Schema.Struct({
  networkId: NetworkIdSchema,
});
export const ListNetworksReq = Schema.Struct({});

// RPC definitions
export const MonadGetBlockNumberRpc = Rpc.make("monad.getBlockNumber", {
  payload: GetBlockNumberReq,
  // String-encoded bigint (see BlockHeight.blockNumber) so it survives JSON.
  success: Schema.BigInt,
  error: MonadRpcError,
});

export const MonadGetActiveNetworkRpc = Rpc.make("monad.getActiveNetwork", {
  payload: GetActiveNetworkReq,
  success: NetworkIdSchema,
});

export const MonadSetActiveNetworkRpc = Rpc.make("monad.setActiveNetwork", {
  payload: SetActiveNetworkReq,
  success: Schema.Void,
});

export const MonadListNetworksRpc = Rpc.make("monad.listNetworks", {
  payload: ListNetworksReq,
  success: Schema.Array(NetworkConfig),
});

// Live stream of latest block for the active (or specified) network
export const MonadBlockHeightStreamRpc = Rpc.make("monad.blockHeightStream", {
  payload: GetBlockNumberReq,
  success: BlockHeight,
  error: MonadRpcError,
  stream: true,
});

// ===== Phase 2: Wallet =====
export class WalletMetadata extends Schema.Class<WalletMetadata>(
  "WalletMetadata",
)({
  id: Schema.String,
  address: Schema.String,
  label: Schema.NullOr(Schema.String),
  source: Schema.Literal("burner", "walletconnect"),
  createdAt: Schema.String,
}) {}

export const WalletCreateBurnerRpc = Rpc.make("monad.wallet.createBurner", {
  payload: Schema.Struct({ label: Schema.optional(Schema.String) }),
  success: WalletMetadata,
  error: MonadRpcError,
});

export const WalletListRpc = Rpc.make("monad.wallet.list", {
  payload: Schema.Struct({}),
  success: Schema.Array(WalletMetadata),
});

export const WalletGetBalanceRpc = Rpc.make("monad.wallet.getBalance", {
  payload: Schema.Struct({ address: Schema.String }),
  // String-encoded bigint so the wei balance survives JSON serialization.
  success: Schema.BigInt,
  error: MonadRpcError,
});

export const WalletSignMessageRpc = Rpc.make("monad.wallet.signMessage", {
  payload: Schema.Struct({
    address: Schema.String,
    message: Schema.String,
  }),
  success: Schema.String, // signature
  error: MonadRpcError,
});

// ===== Phase 3: Devnet + Compile + Deploy =====
export const DevnetStatusSchema = Schema.Struct({
  running: Schema.Boolean,
  port: Schema.NullOr(Schema.Number),
  chainId: Schema.Number,
  url: Schema.NullOr(Schema.String),
});

export const DevnetStartRpc = Rpc.make("monad.devnet.start", {
  payload: Schema.Struct({}),
  success: DevnetStatusSchema,
  error: MonadRpcError,
});

export const DevnetStopRpc = Rpc.make("monad.devnet.stop", {
  payload: Schema.Struct({}),
  success: Schema.Void,
  error: MonadRpcError,
});

export const DevnetStatusRpc = Rpc.make("monad.devnet.status", {
  payload: Schema.Struct({}),
  success: DevnetStatusSchema,
  error: MonadRpcError,
});

// Compile the project's Foundry contracts and report what can be deployed.
export class ConstructorInput extends Schema.Class<ConstructorInput>(
  "ConstructorInput",
)({
  name: Schema.String,
  type: Schema.String,
}) {}

export class CompiledContractInfo extends Schema.Class<CompiledContractInfo>(
  "CompiledContractInfo",
)({
  name: Schema.String,
  constructorInputs: Schema.Array(ConstructorInput),
}) {}

export const CompileRpc = Rpc.make("monad.deploy.compile", {
  payload: Schema.Struct({ projectId: Schema.String }),
  success: Schema.Struct({
    foundryAvailable: Schema.Boolean,
    contracts: Schema.Array(CompiledContractInfo),
  }),
  error: MonadRpcError,
});

export class DeployRecord extends Schema.Class<DeployRecord>("DeployRecord")({
  id: Schema.String,
  projectId: Schema.String,
  network: Schema.String,
  contractName: Schema.String,
  address: Schema.String,
  txHash: Schema.String,
  blockNumber: Schema.NullOr(Schema.Number),
  constructorArgsJson: Schema.NullOr(Schema.String),
  deployedAt: Schema.String,
}) {}

export const DeployContractRpc = Rpc.make("monad.deploy.contract", {
  payload: Schema.Struct({
    projectId: Schema.String,
    contractName: Schema.String,
    constructorArgs: Schema.Array(Schema.Unknown),
    network: Schema.String,
  }),
  success: DeployRecord,
  error: MonadRpcError,
});

export const ListDeploysRpc = Rpc.make("monad.deploy.list", {
  payload: Schema.Struct({ projectId: Schema.String }),
  success: Schema.Array(DeployRecord),
  error: MonadRpcError,
});

// ===== Phase 4: Frontend auto-wire (codegen + dev-server runner) =====

/**
 * Regenerate `frontend/src/contracts/{addresses.ts,abis.ts}` from the
 * project's deploy history + compiled ABIs. `written`/`skipped` are the file
 * names touched vs left alone (skipped = lacked the `@generated` marker, so
 * we refused to clobber a hand-edited file). `frontendMissing` is true when
 * the project has no frontend package — the renderer shows a hint instead of
 * an error.
 */
export const CodegenResultSchema = Schema.Struct({
  written: Schema.Array(Schema.String),
  skipped: Schema.Array(Schema.String),
  frontendMissing: Schema.Boolean,
});

export const MonadCodegenRpc = Rpc.make("monad.codegen", {
  payload: Schema.Struct({ projectId: Schema.String }),
  success: CodegenResultSchema,
  error: MonadRpcError,
});

/** Status of the per-project frontend dev server (one running at a time). */
export const FrontendStatusSchema = Schema.Struct({
  running: Schema.Boolean,
  url: Schema.NullOr(Schema.String),
  pm: Schema.NullOr(Schema.String),
  projectId: Schema.NullOr(Schema.String),
});

export const FrontendStartRpc = Rpc.make("monad.frontend.start", {
  payload: Schema.Struct({ projectId: Schema.String }),
  success: FrontendStatusSchema,
  error: MonadRpcError,
});

export const FrontendStopRpc = Rpc.make("monad.frontend.stop", {
  payload: Schema.Struct({}),
  success: FrontendStatusSchema,
  error: MonadRpcError,
});

export const FrontendStatusRpc = Rpc.make("monad.frontend.status", {
  payload: Schema.Struct({}),
  success: FrontendStatusSchema,
  error: MonadRpcError,
});

// ===== Phase 5: Contract interaction =====

export class AbiParam extends Schema.Class<AbiParam>("AbiParam")({
  name: Schema.String,
  type: Schema.String,
}) {}

/** A callable ABI function, split read vs write by `stateMutability`. */
export class ContractFunctionInfo extends Schema.Class<ContractFunctionInfo>(
  "ContractFunctionInfo",
)({
  name: Schema.String,
  /** "view" | "pure" | "nonpayable" | "payable" */
  stateMutability: Schema.String,
  inputs: Schema.Array(AbiParam),
  outputs: Schema.Array(AbiParam),
}) {}

/**
 * The deployed contract's ABI, split into free reads (view/pure) and
 * state-changing writes. Resolved from the project's compiled artifacts by
 * contract name.
 */
export const ContractFunctionsRpc = Rpc.make("monad.contract.functions", {
  payload: Schema.Struct({
    projectId: Schema.String,
    contractName: Schema.String,
  }),
  success: Schema.Struct({
    reads: Schema.Array(ContractFunctionInfo),
    writes: Schema.Array(ContractFunctionInfo),
  }),
  error: MonadRpcError,
});

/** Call a view/pure function. `result` is the JSON-stringified return value. */
export const ContractReadRpc = Rpc.make("monad.contract.read", {
  payload: Schema.Struct({
    projectId: Schema.String,
    contractName: Schema.String,
    address: Schema.String,
    network: Schema.String,
    functionName: Schema.String,
    args: Schema.Array(Schema.Unknown),
  }),
  success: Schema.Struct({ result: Schema.String }),
  error: MonadRpcError,
});

/**
 * Send a state-changing call. Simulated first (so reverts surface before gas),
 * signed with the most recent burner wallet. `value` is wei as a string (for
 * payable functions); omit otherwise.
 */
export const ContractWriteRpc = Rpc.make("monad.contract.write", {
  payload: Schema.Struct({
    projectId: Schema.String,
    contractName: Schema.String,
    address: Schema.String,
    network: Schema.String,
    functionName: Schema.String,
    args: Schema.Array(Schema.Unknown),
    value: Schema.optional(Schema.String),
  }),
  success: Schema.Struct({
    txHash: Schema.String,
    blockNumber: Schema.NullOr(Schema.Number),
    status: Schema.String,
  }),
  error: MonadRpcError,
});
