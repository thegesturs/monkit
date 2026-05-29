import { Effect, Layer, Stream } from "effect";
import { MemoizeRpcs } from "@memoize/wire";
import { MonadCore } from "./layer.js";
import { MonadWalletService } from "./services/monad-wallet-service.js";

/**
 * Phase 1 + Phase 2 combined handlers for the monad domain.
 */

const GetBlockNumber = MemoizeRpcs.toLayerHandler("monad.getBlockNumber", (payload) =>
  Effect.gen(function* () {
    const core = yield* MonadCore;
    const client = core.getPublicClient(payload.networkId);
    return yield* Effect.tryPromise(() => client.getBlockNumber()).pipe(
      Effect.catchAll(() => Effect.succeed(0n)),
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

// ===== Phase 2 Wallet handlers =====
const WalletCreateBurner = MemoizeRpcs.toLayerHandler("monad.wallet.createBurner", (payload) =>
  Effect.gen(function* () {
    const walletSvc = yield* MonadWalletService;
    return yield* walletSvc.createBurner({ label: payload.label }).pipe(
      Effect.catchAll(() => Effect.succeed({ id: "error", address: "0x0" as any, label: null, source: "burner" as const, createdAt: new Date().toISOString() })),
    );
  }),
);

const WalletList = MemoizeRpcs.toLayerHandler("monad.wallet.list", () =>
  Effect.gen(function* () {
    const walletSvc = yield* MonadWalletService;
    return yield* walletSvc.list().pipe(Effect.catchAll(() => Effect.succeed([])));
  }),
);

const WalletGetBalance = MemoizeRpcs.toLayerHandler("monad.wallet.getBalance", (payload) =>
  Effect.gen(function* () {
    const walletSvc = yield* MonadWalletService;
    return yield* walletSvc.getBalance(payload.address as any).pipe(Effect.catchAll(() => Effect.succeed(0n)));
  }),
);

const WalletSignMessage = MemoizeRpcs.toLayerHandler("monad.wallet.signMessage", (payload) =>
  Effect.gen(function* () {
    const walletSvc = yield* MonadWalletService;
    return yield* walletSvc.signMessage(payload.address as any, payload.message).pipe(
      Effect.catchAll(() => Effect.succeed("0x" as `0x${string}`)),
    );
  }),
);

export const MonadHandlersLayer = Layer.mergeAll(
  GetBlockNumber,
  GetActiveNetwork,
  SetActiveNetwork,
  ListNetworks,
  BlockHeightStream,
  // Phase 2
  WalletCreateBurner,
  WalletList,
  WalletGetBalance,
  WalletSignMessage,
);
