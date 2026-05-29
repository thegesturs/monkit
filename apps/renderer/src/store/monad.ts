import { Effect, Fiber, Stream } from "effect";
import { create } from "zustand";

import type { NetworkId } from "@memoize/wire";

import { getRpcClient } from "../lib/rpc-client.ts";

/**
 * Minimal Monad store for Phase 1.
 * - Tracks the active network (default testnet)
 * - Subscribes to the live block height stream from the server
 * - Exposes a simple status string for the right-pane chip
 *
 * Because monkit is Monad-only, this store is always active.
 */

type MonadState = {
  readonly activeNetwork: NetworkId;
  readonly blockNumber: bigint | null;
  readonly lastUpdated: Date | null;
  readonly error: string | null;

  readonly setActiveNetwork: (id: NetworkId) => Promise<void>;
  readonly startBlockStream: () => void;
  readonly stopBlockStream: () => void;

  /** Convenience for the status chip */
  readonly statusText: () => string;
};

let blockStreamFiber: Fiber.RuntimeFiber<unknown, unknown> | null = null;

export const useMonadStore = create<MonadState>((set, get) => ({
  activeNetwork: "testnet",
  blockNumber: null,
  lastUpdated: null,
  error: null,

  setActiveNetwork: async (id) => {
    try {
      const client = await getRpcClient();
      await Effect.runPromise(client.monad.setActiveNetwork({ networkId: id }));
      set({ activeNetwork: id, blockNumber: null, error: null });
      // Restart stream for the new network
      get().stopBlockStream();
      get().startBlockStream();
    } catch (err) {
      set({ error: String(err) });
    }
  },

  startBlockStream: () => {
    if (blockStreamFiber !== null) return;

    void (async () => {
      try {
        const client = await getRpcClient();
        const networkId = get().activeNetwork;

        blockStreamFiber = Effect.runFork(
          Stream.runForEach(client.monad.blockHeightStream({ networkId }), (bh) =>
            Effect.sync(() => {
              set({
                blockNumber: bh.blockNumber,
                lastUpdated: bh.updatedAt,
                error: null,
              });
            }),
          ),
        );
      } catch (err) {
        set({ error: String(err) });
      }
    })();
  },

  stopBlockStream: () => {
    if (blockStreamFiber) {
      Effect.runFork(Fiber.interrupt(blockStreamFiber));
      blockStreamFiber = null;
    }
  },

  statusText: () => {
    const { activeNetwork, blockNumber, error } = get();
    const label = activeNetwork === "testnet" ? "Monad Testnet" : activeNetwork === "local" ? "Local Devnet" : "Monad Mainnet";
    if (error) return `${label} — error`;
    if (blockNumber === null) return `${label} — connecting…`;
    return `${label} — block ${blockNumber.toString()}`;
  },
}));
