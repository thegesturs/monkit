import { Layer } from "effect";
import { MonadCore, MonadCoreLive } from "@memoize/monad-core";
import { NodeContext } from "@effect/platform-node";

/**
 * Phase 1 Monad layer composition.
 * Currently just re-exports the pure monad-core live layer.
 * Future phases will add:
 *  - MonadConfig / persisted active network + custom RPCs
 *  - Wallet service (keychain-backed burners + WalletConnect)
 *  - Devnet / anvil lifecycle (PTY)
 *  - Deploy / compile services
 */
export const MonadLayer = MonadCoreLive.pipe(Layer.provide(NodeContext.layer));

export { MonadCore } from "@memoize/monad-core";
