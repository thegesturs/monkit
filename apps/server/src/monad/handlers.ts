import { Effect, Layer, Stream } from "effect";
import { MemoizeRpcs, MonadRpcError } from "@memoize/wire";
import { MonadCore } from "./layer.js";
import { MonadWalletService } from "./services/monad-wallet-service.js";
import { MonadDeployService } from "./services/monad-deploy-service.js";

const toMonadRpcError = (cause: unknown) =>
  new MonadRpcError({
    message: cause instanceof Error ? cause.message : String(cause),
  });

/**
 * Phase 1 + Phase 2 combined handlers for the monad domain.
 */

const GetBlockNumber = MemoizeRpcs.toLayerHandler(
  "monad.getBlockNumber",
  (payload) =>
    Effect.gen(function* () {
      const core = yield* MonadCore;
      const client = core.getPublicClient(payload.networkId);
      // Surface the real failure so the renderer can show a reason + Retry,
      // instead of masking it as block 0 (which looks like a stalled chain).
      return yield* Effect.tryPromise({
        try: () => client.getBlockNumber(),
        catch: (cause) => new MonadRpcError({ message: String(cause) }),
      });
    }),
);

const GetActiveNetwork = MemoizeRpcs.toLayerHandler(
  "monad.getActiveNetwork",
  () =>
    Effect.gen(function* () {
      const core = yield* MonadCore;
      return core.getActiveNetwork();
    }),
);

const SetActiveNetwork = MemoizeRpcs.toLayerHandler(
  "monad.setActiveNetwork",
  (payload) =>
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

const BlockHeightStream = MemoizeRpcs.toLayerHandler(
  "monad.blockHeightStream",
  (payload) =>
    Stream.unwrap(
      Effect.gen(function* () {
        const core = yield* MonadCore;
        const netId = payload.networkId ?? core.getActiveNetwork();
        const net = core.listNetworks().find((n) => n.id === netId)!;

        // Do NOT swallow errors into an empty stream — that silently completes
        // the stream and leaves consumers stuck on "connecting…". Log it and
        // surface it via the declared error channel. (Status now polls
        // getBlockNumber; this stream is kept for future push consumers.)
        return Stream.map(
          core.blockNumberStream(netId).pipe(
            Stream.tapError((e) =>
              Effect.logError(`blockHeightStream error for ${netId}`, e),
            ),
            Stream.mapError((e) => new MonadRpcError({ message: String(e) })),
          ),
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
const WalletCreateBurner = MemoizeRpcs.toLayerHandler(
  "monad.wallet.createBurner",
  (payload) =>
    Effect.gen(function* () {
      const walletSvc = yield* MonadWalletService;
      // Let real failures propagate — a fake 0x0 wallet silently poisons the
      // wallet list and keychain lookups. The renderer surfaces this via a toast.
      return yield* walletSvc
        .createBurner({ label: payload.label })
        .pipe(
          Effect.mapError(
            (cause) => new MonadRpcError({ message: String(cause) }),
          ),
        );
    }),
);

const WalletList = MemoizeRpcs.toLayerHandler("monad.wallet.list", () =>
  Effect.gen(function* () {
    const walletSvc = yield* MonadWalletService;
    return yield* walletSvc
      .list()
      .pipe(Effect.catchAll(() => Effect.succeed([])));
  }),
);

const WalletGetBalance = MemoizeRpcs.toLayerHandler(
  "monad.wallet.getBalance",
  (payload) =>
    Effect.gen(function* () {
      const walletSvc = yield* MonadWalletService;
      return yield* walletSvc
        .getBalance(payload.address as any)
        .pipe(
          Effect.mapError(
            (cause) => new MonadRpcError({ message: String(cause) }),
          ),
        );
    }),
);

const WalletSignMessage = MemoizeRpcs.toLayerHandler(
  "monad.wallet.signMessage",
  (payload) =>
    Effect.gen(function* () {
      const walletSvc = yield* MonadWalletService;
      return yield* walletSvc
        .signMessage(payload.address as any, payload.message)
        .pipe(
          Effect.mapError(
            (cause) => new MonadRpcError({ message: String(cause) }),
          ),
        );
    }),
);

// ===== Phase 3 Devnet + Compile + Deploy handlers =====
const DevnetStart = MemoizeRpcs.toLayerHandler("monad.devnet.start", () =>
  Effect.gen(function* () {
    const svc = yield* MonadDeployService;
    return yield* svc.devnetStart().pipe(Effect.mapError(toMonadRpcError));
  }),
);

const DevnetStop = MemoizeRpcs.toLayerHandler("monad.devnet.stop", () =>
  Effect.gen(function* () {
    const svc = yield* MonadDeployService;
    return yield* svc.devnetStop().pipe(Effect.mapError(toMonadRpcError));
  }),
);

const DevnetStatus = MemoizeRpcs.toLayerHandler("monad.devnet.status", () =>
  Effect.gen(function* () {
    const svc = yield* MonadDeployService;
    return yield* svc.devnetStatus().pipe(Effect.mapError(toMonadRpcError));
  }),
);

const Compile = MemoizeRpcs.toLayerHandler("monad.deploy.compile", (payload) =>
  Effect.gen(function* () {
    const svc = yield* MonadDeployService;
    return yield* svc
      .compile(payload.projectId)
      .pipe(Effect.mapError(toMonadRpcError));
  }),
);

const DeployContract = MemoizeRpcs.toLayerHandler(
  "monad.deploy.contract",
  (payload) =>
    Effect.gen(function* () {
      const svc = yield* MonadDeployService;
      return yield* svc
        .deploy({
          projectId: payload.projectId,
          contractName: payload.contractName,
          constructorArgs: payload.constructorArgs,
          network: payload.network,
        })
        .pipe(Effect.mapError(toMonadRpcError));
    }),
);

const ListDeploys = MemoizeRpcs.toLayerHandler("monad.deploy.list", (payload) =>
  Effect.gen(function* () {
    const svc = yield* MonadDeployService;
    return yield* svc
      .list(payload.projectId)
      .pipe(Effect.mapError(toMonadRpcError));
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
  // Phase 3
  DevnetStart,
  DevnetStop,
  DevnetStatus,
  Compile,
  DeployContract,
  ListDeploys,
);
