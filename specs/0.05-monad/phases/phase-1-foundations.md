# Phase 1 — Foundations

**Goal.** Plumbing exists. Renderer can toggle Monad mode and see the new tab group. RPC roundtrips to Monad testnet succeed and block height ticks.

## Scope

- New package: `packages/monad-core` with `networks.ts`, `rpc.ts`, `schema.ts`.
- New wire contracts: `packages/wire/src/monad.ts`.
- SQLite migration adding `monad_mode` and `monad_config_path` to `projects`.
- Server: `apps/server/src/monad/{layer.ts, rpc-handlers.ts}` exposing `getBlockNumber`, `getNetwork`, `listNetworks`, `getActiveNetwork`, `setActiveNetwork`.
- Renderer: project settings toggle, right-pane `monad-tab-group.tsx` placeholder shell, network/block-height status chip.

## Out of scope (this phase)

- Any wallet generation, signing, balance fetch (Phase 2).
- Any contract compile / deploy (Phase 3).
- MCP tools (Phase 5).
- Templates (Phase 6).

## Critical files (read before editing)

- `apps/server/src/runtime.ts` — compose `MonadLayer` into the existing runtime.
- `apps/server/src/handlers.ts` — register the new RPC handlers alongside existing ones.
- `apps/server/src/db/` — migration patterns for SQLite.
- `apps/renderer/src/components/right-pane.tsx` — where to slot the placeholder tab group.
- `apps/renderer/src/components/settings-page.tsx` + `settings/` — where to add the Monad mode toggle.
- `packages/wire/src/index.ts` — re-export `monad.ts` types.
- `specs/0.04-MVP/features/code-index.md` — package-as-library pattern reference.

## Implementation steps

1. **Create `packages/monad-core`.**
   - `package.json` with viem dep (`^2.x`).
   - `src/schema.ts`: branded ids `Address`, `TxHash`, `ChainId`, `NetworkId`.
   - `src/networks.ts`: NETWORKS map with `local`, `testnet`, `mainnet` entries (chain ids + RPC URLs as constants — confirm against Monad docs at impl time).
   - `src/rpc.ts`: `getPublicClient(networkId): PublicClient`, `blockNumberStream(networkId)`.
   - Export Effect service: `Rpc.Service`.

2. **Add `packages/wire/src/monad.ts`.**
   - Schemas: `NetworkConfig`, `BlockHeight`, `GetBlockNumberReq`, `GetActiveNetworkReq`, `SetActiveNetworkReq`.
   - Export from `packages/wire/src/index.ts`.

3. **SQLite migration.**
   - `ALTER TABLE projects ADD COLUMN monad_mode BOOLEAN NOT NULL DEFAULT FALSE`.
   - `ALTER TABLE projects ADD COLUMN monad_config_path TEXT`.
   - New table `monad_networks` (id, chainId, rpcUrl, explorerUrl, isCustom, projectId nullable).

4. **Server wiring.**
   - `apps/server/src/monad/layer.ts` composing `Rpc` and a `MonadConfig` service.
   - `apps/server/src/monad/rpc-handlers.ts` registers the new RPC endpoints in the existing handler registry.
   - Add layer to `runtime.ts`.

5. **Renderer.**
   - Settings page: toggle "Monad mode" per active project; persists via existing project-update RPC.
   - Right pane: when active session's project has Monad mode, render `MonadTabGroup` next to existing tab group.
   - `MonadTabGroup` placeholder with tabs Wallet / Contracts / Deploy / Explorer all showing "Coming in Phase N" notes — except the status chip showing live block height (Phase 1 deliverable).
   - Status chip uses `blockNumberStream` via the existing RPC stream pattern.

## Verification (end-to-end)

1. Pull main, run app on a clean profile.
2. Open or create a project; go to project Settings → enable Monad mode.
3. Right pane shows Monad tab group.
4. Status chip in right-pane header shows "Monad testnet — block N" with N ticking upward every few seconds.
5. Switch network registry entry (manually edit `monad_networks` table or via dev panel) → status chip reflects new chain id.
6. Disable Monad mode → tab group disappears, chip disappears.

## PR scope

One PR titled `feat(monad): foundations — package, wire contracts, mode toggle, block height (#NNN)`. Diff < ~1500 LOC.
