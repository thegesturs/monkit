import { Effect } from "effect";
import { create } from "zustand";

import type { NetworkId } from "@memoize/wire";

import { getRpcClient } from "../lib/rpc-client.ts";

/**
 * Monad network store.
 *
 * Connection status is driven by a plain 2s POLL of `monad.getBlockNumber`
 * (a request/response RPC), not the streaming RPC. Polling is trivially
 * correct, self-heals every tick, and surfaces per-call errors — where the
 * old streaming path silently completed on the first error and left the UI
 * stuck on "connecting…" forever.
 *
 * Because monkit is Monad-only, this store is always active.
 */

const POLL_INTERVAL_MS = 2_000;

export type ConnState =
  | { readonly kind: "connecting" }
  | {
      readonly kind: "live";
      readonly blockNumber: bigint;
      readonly updatedAt: Date;
    }
  | { readonly kind: "error"; readonly reason: string };

type MonadState = {
  readonly activeNetwork: NetworkId;
  readonly status: ConnState;
  /** Last successfully observed block, kept across transient errors for continuity. */
  readonly lastBlock: bigint | null;

  readonly setActiveNetwork: (id: NetworkId) => Promise<void>;
  readonly startPolling: () => void;
  readonly stopPolling: () => void;
  readonly retry: () => void;

  /** Human label for the active network. */
  readonly networkLabel: () => string;
};

let pollTimer: ReturnType<typeof setInterval> | null = null;
/** Bumped on every network switch so in-flight polls from the old network are ignored. */
let generation = 0;

function labelFor(id: NetworkId): string {
  return id === "testnet"
    ? "Monad Testnet"
    : id === "local"
      ? "Local Devnet"
      : "Monad Mainnet";
}

export const useMonadStore = create<MonadState>((set, get) => {
  const pollOnce = async () => {
    const gen = generation;
    const networkId = get().activeNetwork;
    try {
      const client = await getRpcClient();
      const blockNumber = await Effect.runPromise(
        client.monad.getBlockNumber({ networkId }),
      );
      if (gen !== generation) return; // network switched mid-flight
      set({
        status: { kind: "live", blockNumber, updatedAt: new Date() },
        lastBlock: blockNumber,
      });
    } catch (err) {
      if (gen !== generation) return;
      const reason =
        err instanceof Error ? err.message : String(err ?? "Unknown error");
      set({ status: { kind: "error", reason } });
    }
  };

  return {
    activeNetwork: "testnet",
    status: { kind: "connecting" },
    lastBlock: null,

    setActiveNetwork: async (id) => {
      generation += 1;
      set({
        activeNetwork: id,
        status: { kind: "connecting" },
        lastBlock: null,
      });
      try {
        const client = await getRpcClient();
        await Effect.runPromise(
          client.monad.setActiveNetwork({ networkId: id }),
        );
      } catch (err) {
        const reason =
          err instanceof Error ? err.message : String(err ?? "Unknown error");
        set({ status: { kind: "error", reason } });
        return;
      }
      // Restart polling against the new network (immediate first tick).
      get().stopPolling();
      get().startPolling();
    },

    startPolling: () => {
      if (pollTimer !== null) return;
      void pollOnce(); // immediate — don't wait a full interval to show life
      pollTimer = setInterval(() => void pollOnce(), POLL_INTERVAL_MS);
    },

    stopPolling: () => {
      if (pollTimer !== null) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
    },

    retry: () => {
      set({ status: { kind: "connecting" } });
      void pollOnce();
    },

    networkLabel: () => labelFor(get().activeNetwork),
  };
});
