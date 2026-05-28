# Phase 2 — Wallet + network

**Goal.** Users have a working wallet. They can switch networks. They can request testnet funds. Sign-message works with the permission card.

## Scope

- Burner wallet generation + keychain storage.
- WalletConnect v2 bridge.
- `NetworkSwitcher` UI.
- `WalletPanel` UI: address, balance, label, faucet button.
- Sign-message flow.
- Mainnet hide/unhide setting + always-confirm modal (skeleton; full mainnet flows complete in Phase 5).

## Out of scope

- Compile / deploy (Phase 3).
- MCP tools (Phase 5) — UI-only for this phase.
- Hardware wallets (Phase 7+).

## Critical files

- `apps/desktop/src/credentials/` — keychain access patterns to reuse.
- `apps/server/src/policy.ts` — extend with `monad.sign_message`, `monad.export_private_key`.
- `apps/server/src/monad/layer.ts` (from Phase 1) — extend with `Wallet` service.
- `apps/renderer/src/components/permission-card.tsx` — render new permission kinds.
- `packages/monad-ui/` — new package for `WalletPanel`, `NetworkSwitcher`, etc.

## Implementation steps

1. **Create `packages/monad-ui`.**
   - Mirror `packages/ui` setup (Tailwind, shadcn imports).
   - `WalletPanel.tsx`, `NetworkSwitcher.tsx`, `MainnetConfirmModal.tsx`.

2. **`monad-core/wallet.ts`.**
   - `generateBurner(label?)`: viem `generatePrivateKey` → store in keychain → row in `monad_wallets`.
   - `listWallets(projectId)`.
   - `getActiveWallet(sessionId)` / `setActiveWallet(sessionId, walletId)`.
   - `signMessage(walletId, message)`: fetch key, viem sign, return signature. Never exposes key.
   - `getBalance(walletId, networkId)`.

3. **WalletConnect v2.**
   - Server-side `@walletconnect/sign-client` instance per project.
   - QR pairing flow: server returns URI, renderer renders QR.
   - Session storage in keychain.
   - Disconnect / reconnect endpoints.

4. **Wire types.**
   - `Wallet`, `WalletId`, `SignMessageReq`, `RequestFaucetReq`, etc. in `packages/wire/src/monad.ts`.

5. **Permission extensions.**
   - `policy.ts` adds `monad.sign_message`, `monad.export_private_key`.
   - Default behavior per [permissions.md](../features/permissions.md).
   - Permission card renders message preview for sign-message.

6. **Mainnet visibility setting.**
   - Settings → Monad → "Show mainnet" toggle.
   - `NetworkSwitcher` hides mainnet when off.
   - First-enable shows a disclaimer dialog.

7. **Faucet.**
   - `monad-core/wallet.ts` `requestFaucet(address, networkId)`.
   - Hits the public Monad testnet faucet endpoint (URL TBD at impl time).
   - Rate-limit handling: surface upstream errors as toasts.

8. **Renderer wiring.**
   - Phase 1's placeholder Wallet tab now renders `WalletPanel`.
   - `NetworkSwitcher` lives in the right-pane header next to the block height chip.

## Verification

1. New burner generated → address visible, balance shows 0 on testnet.
2. Switch Local↔Testnet → balance and chain id update.
3. Click faucet on testnet → balance reflects funded amount after a block.
4. Sign a message via the WalletPanel "Sign message" button → permission card appears → confirm → signature returned.
5. Toggle "Show mainnet" → mainnet appears as an option; disclaimer shown first time.
6. WalletConnect pairing flow completes with MetaMask Mobile against testnet (manual test).
7. Export-key flow: requires always-confirm modal regardless of network.

## PR scope

One PR titled `feat(monad): wallets, network switcher, faucet, sign message (#NNN)`. Diff < ~2500 LOC.
