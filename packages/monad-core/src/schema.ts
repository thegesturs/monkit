import { Schema } from "effect";

/**
 * Branded IDs for Monad domain (prevents stringly-typed accidents).
 */
export const Address = Schema.String.pipe(
  Schema.pattern(/^0x[a-fA-F0-9]{40}$/),
  Schema.brand("Address"),
);
export type Address = typeof Address.Type;

export const TxHash = Schema.String.pipe(
  Schema.pattern(/^0x[a-fA-F0-9]{64}$/),
  Schema.brand("TxHash"),
);
export type TxHash = typeof TxHash.Type;

export const ChainId = Schema.Number.pipe(Schema.brand("ChainId"));
export type ChainId = typeof ChainId.Type;

export const NetworkId = Schema.Literal("local", "testnet", "mainnet");
export type NetworkId = typeof NetworkId.Type;

/**
 * Tagged errors for the Monad domain.
 */
export class UnknownNetworkError extends Schema.TaggedError<UnknownNetworkError>()(
  "UnknownNetworkError",
  { networkId: Schema.String },
) {}

export class RpcError extends Schema.TaggedError<RpcError>()("RpcError", {
  message: Schema.String,
  cause: Schema.optional(Schema.Unknown),
}) {}

export type MonadError = UnknownNetworkError | RpcError;
