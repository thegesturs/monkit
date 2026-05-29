import { Rpc } from "@effect/rpc";
import { Schema } from "effect";

// Phase 1 minimal types (can be refined later)
export const NetworkIdSchema = Schema.Literal("local", "testnet", "mainnet");

export class NetworkConfig extends Schema.Class<NetworkConfig>("NetworkConfig")({
  id: NetworkIdSchema,
  chainId: Schema.Number,
  name: Schema.String,
  rpcUrl: Schema.String,
  explorerUrl: Schema.NullOr(Schema.String),
}) {}

export class BlockHeight extends Schema.Class<BlockHeight>("BlockHeight")({
  networkId: NetworkIdSchema,
  chainId: Schema.Number,
  blockNumber: Schema.BigIntFromSelf,
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
  success: Schema.BigIntFromSelf,
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
  stream: true,
});

// ===== Phase 2: Wallet =====
export class WalletMetadata extends Schema.Class<WalletMetadata>("WalletMetadata")({
  id: Schema.String,
  address: Schema.String,
  label: Schema.NullOr(Schema.String),
  source: Schema.Literal("burner", "walletconnect"),
  createdAt: Schema.String,
}) {}

export const WalletCreateBurnerRpc = Rpc.make("monad.wallet.createBurner", {
  payload: Schema.Struct({ label: Schema.optional(Schema.String) }),
  success: WalletMetadata,
});

export const WalletListRpc = Rpc.make("monad.wallet.list", {
  payload: Schema.Struct({}),
  success: Schema.Array(WalletMetadata),
});

export const WalletGetBalanceRpc = Rpc.make("monad.wallet.getBalance", {
  payload: Schema.Struct({ address: Schema.String }),
  success: Schema.BigIntFromSelf,
});

export const WalletSignMessageRpc = Rpc.make("monad.wallet.signMessage", {
  payload: Schema.Struct({
    address: Schema.String,
    message: Schema.String,
  }),
  success: Schema.String, // signature
});
