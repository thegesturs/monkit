# Feature: RPC + Network registry

## Why

Every Monad operation needs a network: read calls, deploys, signs, balance fetches. Switching between local devnet, testnet, and mainnet must be one click — and the active network must be obvious at all times.

## Network registry

Defined in `packages/monad-core/src/networks.ts`. Three built-ins shipped:

| Id | ChainId | RPC | Explorer | Notes |
|---|---|---|---|---|
| `local` | 41454 (anvil default) | http://127.0.0.1:<port> | none | Spawned by the app |
| `testnet` | TBD (Monad official) | https://testnet-rpc.monad.xyz | https://testnet-explorer.monad.xyz | Faucet enabled |
| `mainnet` | TBD (Monad official) | https://rpc.monad.xyz | https://explorer.monad.xyz | Hidden behind setting; always-confirm |

Real chain ids / URLs are filled during Phase 1 implementation against the canonical Monad docs at that time. The registry shape is stable.

## User-defined networks

Settings → Monad → Networks → Add. Fields: id, chainId, rpcUrl, explorerUrl (optional). Stored in `monad_networks` SQLite table.

## Active network

- Stored per **session**, not per project — so two sessions in the same project can target different networks.
- Renderer's `NetworkSwitcher` controls it.
- All `monad_*` MCP tools and slash commands default to the active network unless overridden.

## RPC client

- `monad-core/rpc.ts` exposes `getPublicClient(networkId): PublicClient` (viem).
- Cached per network; recreated on config change.
- Block height polled every 4 seconds and streamed to the renderer (Effect Stream over RPC).
- On RPC failure: 3 exponential retries, then status indicator turns red and surfaces the error.

## RPC status indicator

Persistent chip in the right-pane header:
- 🟢 connected, block N
- 🟡 connecting / retrying
- 🔴 down — show last error on click

## Out of scope

- Auto-failover between RPC providers — single URL per network.
- Per-call gas oracle / fee estimation overrides — viem defaults are fine for 0.05.
