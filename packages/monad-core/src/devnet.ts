import { Context, type Effect, type Stream } from "effect";

/**
 * Phase 3: Local devnet (anvil) management.
 *
 * This service is responsible for the lifecycle of a local Monad-compatible
 * devnet. The actual process spawning happens in the server layer using
 * the existing PTY infrastructure.
 */

export interface DevnetStatus {
  readonly running: boolean;
  readonly port: number | null;
  readonly chainId: number;
  readonly url: string | null;
}

export interface MonadDevnetServiceShape {
  /** Start the local devnet (anvil). Idempotent if already running. */
  readonly start: () => Effect.Effect<DevnetStatus, Error>;

  /** Stop the local devnet. */
  readonly stop: () => Effect.Effect<void, Error>;

  /** Get current status. */
  readonly status: () => Effect.Effect<DevnetStatus, Error>;

  /** Stream of logs from the devnet process (when running). */
  readonly logs: () => Stream.Stream<string, Error>;
}

export class MonadDevnetService extends Context.Tag("memoize/MonadDevnetService")<
  MonadDevnetService,
  MonadDevnetServiceShape
>() {}
