import { Effect, Layer, Stream } from "effect";
import { MemoizeRpcs } from "@memoize/wire";
import { MonadCore } from "./layer.js";

/**
 * Phase 1 RPC handlers for the monad domain.
 * Thin delegation to the MonadCore service from @memoize/monad-core.
 */

const GetBlockNumber = MemoizeRpcs.toLayerHandler("monad.getBlockNumber", (payload) =>
  Effect.gen(function* () {
    const core = yield* MonadCore;
    const client = core.getPublicClient(payload.networkId);
    return yield* Effect.tryPromise(() => client.getBlockNumber()).pipe(
      Effect.catchAll(() => Effect.succeed(0n)), // Phase 1: never fail the RPC for the status chip
    );
  }),
);

const GetActiveNetwork = MemoizeRpcs.toLayerHandler("monad.getActiveNetwork", () =>
  Effect.gen(function* () {
    const core = yield* MonadCore;
    return core.getActiveNetwork();
  }),
);

const SetActiveNetwork = MemoizeRpcs.toLayerHandler("monad.setActiveNetwork", (payload) =>
  Effect.gen(function* () {
    const core = yield* MonadCore;
    core.setActiveNetwork(payload.networkId);
  }),
);

const ListNetworks = MemoizeRpcs.toLayerHandler("monad.listNetworks", () =>
  Effect.gen(function* () {
    const core = yield* MonadCore;
    return core.listNetworks();
  }),
);

const BlockHeightStream = MemoizeRpcs.toLayerHandler("monad.blockHeightStream", (payload) =>
  Stream.unwrap(
    Effect.gen(function* () {
      const core = yield* MonadCore;
      const netId = payload.networkId ?? core.getActiveNetwork();
      const net = core.listNetworks().find((n) => n.id === netId)!;

      // Map to the exact wire BlockHeight shape; swallow transient errors for the live chip
      return Stream.map(
        core.blockNumberStream(netId).pipe(Stream.catchAll(() => Stream.empty)),
        (blockNumber) => ({
          networkId: netId,
          chainId: net.chainId,
          blockNumber,
          updatedAt: new Date(),
        }),
      );
    }),
  ),
);

export const MonadHandlersLayer = Layer.mergeAll(
  GetBlockNumber,
  GetActiveNetwork,
  SetActiveNetwork,
  ListNetworks,
  BlockHeightStream,
);
