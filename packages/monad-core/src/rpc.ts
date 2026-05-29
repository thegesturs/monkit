import { Context, Effect, Layer, Schedule, Stream } from "effect";
import {
  createPublicClient,
  http,
  type PublicClient,
  webSocket,
} from "viem";
import { MonadCore, type MonadCoreShape } from "./api.js";
import { getNetwork, type NetworkId, NETWORKS } from "./networks.js";
import { type MonadError, RpcError, UnknownNetworkError } from "./schema.js";

const TAG = "memoize/MonadCore";

/**
 * In-memory active network state for Phase 1.
 * Later phases will make this part of a persisted MonadConfig service.
 */
let activeNetworkId: NetworkId = "testnet";

const clients = new Map<NetworkId, PublicClient>();

function getOrCreateClient(networkId: NetworkId): PublicClient {
  const cached = clients.get(networkId);
  if (cached) return cached;

  const net = getNetwork(networkId);
  const transport = net.rpcUrl.startsWith("ws")
    ? webSocket(net.rpcUrl)
    : http(net.rpcUrl, { batch: { batchSize: 4, wait: 50 } });

  const client = createPublicClient({
    chain: {
      id: net.chainId,
      name: net.name,
      nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
      rpcUrls: { default: { http: [net.rpcUrl] } },
    },
    transport,
  });

  clients.set(networkId, client);
  return client;
}

const makeLive: Effect.Effect<MonadCoreShape, never> = Effect.succeed({
  getActiveNetwork: () => activeNetworkId,

  setActiveNetwork: (id: NetworkId) => {
    // Will throw synchronously if unknown (fail fast, same as getNetwork)
    getNetwork(id);
    activeNetworkId = id;
  },

  listNetworks: () => Object.values(NETWORKS),

  getPublicClient: (networkId?: NetworkId) =>
    getOrCreateClient(networkId ?? activeNetworkId),

  blockNumberStream: (networkId?: NetworkId) => {
    const id = networkId ?? activeNetworkId;
    const client = getOrCreateClient(id);

    // Robust polling stream (works reliably across Effect versions)
    const fetchOnce = Effect.tryPromise({
      try: () => client.getBlockNumber(),
      catch: (err) => new RpcError({ message: String(err), cause: err }),
    });

    return Stream.repeatEffect(fetchOnce).pipe(
      Stream.schedule(Schedule.spaced("2 seconds")),
      Stream.tapError((e) => Effect.logError(`blockNumberStream error for ${id}`, e)),
    );
  },
});

export const MonadCoreLive = Layer.effect(MonadCore, makeLive);

/**
 * Convenience pure helper (used by handlers / tests).
 */
export const getPublicClientForNetwork = (id: NetworkId) => getOrCreateClient(id);
