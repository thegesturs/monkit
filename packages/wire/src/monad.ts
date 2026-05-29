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
