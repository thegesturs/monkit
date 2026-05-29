import { Context, type Stream } from "effect";
import { type NetworkConfig, type NetworkId } from "./networks.js";
import { type Address, type ChainId, type MonadError } from "./schema.js";

/**
 * Public service interface for monad-core (Phase 1 minimal surface).
 * Expanded in later phases with wallet, deploy, compile, etc.
 */
export interface MonadCoreShape {
  /** Current active network (default: testnet for happy path in this fork) */
  readonly getActiveNetwork: () => NetworkId;

  /** Switch active network (in-memory for Phase 1; persisted later) */
  readonly setActiveNetwork: (id: NetworkId) => void;

  /** List all known networks */
  readonly listNetworks: () => readonly NetworkConfig[];

  /** Get a viem PublicClient for the given (or active) network */
  readonly getPublicClient: (networkId?: NetworkId) => import("viem").PublicClient;

  /** Live stream of latest block number for a network. Never fails after first emission. */
  readonly blockNumberStream: (
    networkId?: NetworkId,
  ) => Stream.Stream<bigint, MonadError>;
}

export class MonadCore extends Context.Tag("memoize/MonadCore")<
  MonadCore,
  MonadCoreShape
>() {}
