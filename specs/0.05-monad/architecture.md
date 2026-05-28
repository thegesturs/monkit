# Architecture

## Reuse contract — do NOT fork

This MVP extends the existing app. Every Monad capability must reuse the existing primitives below. No parallel runtime, no parallel permission system, no parallel credential store.

| Capability | Existing primitive (reuse) | New code (extend) |
|---|---|---|
| Async / errors / DI | Effect.ts `Layer`, `Service`, `Stream` | `MonadLayer` composed into existing runtime |
| IPC contracts | `packages/wire` (@effect/rpc) | `packages/wire/src/monad.ts` |
| Renderer ↔ server RPC | `apps/server/src/handlers.ts` | `apps/server/src/monad/rpc-handlers.ts` |
| Permission policy | `apps/server/src/policy.ts` + ACP shared policy | new permission kinds: `monad.sign`, `monad.deploy`, `monad.write` |
| Credential storage | macOS Keychain via desktop credentials layer | burner private keys + WalletConnect session secrets |
| Long-running processes | existing PTY infra (used by terminals) | `anvil`, `forge build`, `forge script`, frontend dev server |
| MCP tools to agents | `apps/mcp-server` registration pattern | `apps/mcp-server/src/tools/monad.ts` |
| Slash commands | `apps/renderer/src/composer/` registry | `monad-commands.ts` entries |
| Persistence | existing SQLite | new tables: `monad_deploys`, `monad_networks`, `monad_wallets` (encrypted ref only) |
| Right-pane tabs | `right-pane.tsx` tab group system | `monad-tab-group.tsx` (Wallet/Contracts/Deploy/Explorer) |
| Project metadata | existing `projects` table | add `monad_mode: boolean`, `monad_config_path: string?` |

## Package layout

```
packages/
  monad-core/                — Effect services, pure logic, no UI, no Electron
    src/
      rpc.ts                 — viem PublicClient per network, eth_blockNumber polling
      wallet.ts              — burner gen, keychain bridge, WalletConnect v2 session
      networks.ts            — network registry: local, testnet, mainnet
      compile.ts             — wraps `forge build`, parses artifact JSON
      deploy.ts              — deploy w/ encoded constructor args, returns address + tx hash
      abi.ts                 — ABI parsing, classify functions (read/write/event)
      codegen.ts             — write addresses.ts / abis.ts / hooks.ts into frontend
      devnet.ts              — anvil lifecycle: spawn, port pick, restart, kill on shutdown
      explorer.ts            — local tx history, log decoding against known ABIs
      publish.ts             — vite/next build + web3.storage upload
      schema.ts              — branded ids (Address, TxHash, ChainId, NetworkId) + errors

  monad-ui/                  — shared React components (used by renderer + future tooling)
    src/
      WalletPanel.tsx
      NetworkSwitcher.tsx
      ContractsPanel.tsx
      ContractFunctionForm.tsx
      DeployButton.tsx
      DeployHistoryList.tsx
      ExplorerPanel.tsx
      TxRow.tsx
      AbiArgInput.tsx
      MainnetConfirmModal.tsx

  monad-templates/           — copy-on-bootstrap project skeletons
    starter-foundry-vite/
      contracts/
      frontend/
      monad.config.json
      AGENTS.md              — AI instructions baked into the template
    starter-foundry-next/
```

## Service graph

```
                ┌─────────────────────────────────────────────┐
                │              apps/renderer                  │
                │  monad-tab-group → wallet/contracts/deploy  │
                │  composer slash commands /deploy /call …    │
                └──────────────┬──────────────────────────────┘
                               │  @effect/rpc (existing)
                ┌──────────────▼──────────────────────────────┐
                │              apps/server                    │
                │  monad/rpc-handlers.ts                      │
                │  monad/layer.ts (Effect Layer composition)  │
                │  policy.ts (extended with monad permissions)│
                └──┬──────────────────────────────────────┬───┘
                   │                                      │
   ┌───────────────▼─────────┐         ┌──────────────────▼─────────────┐
   │     packages/monad-core │         │       apps/mcp-server          │
   │  rpc, wallet, compile,  │◄────────│  tools/monad.ts (MCP surface)  │
   │  deploy, devnet, …      │         │  monad_deploy, monad_call, …   │
   └───────┬─────────────────┘         └────────────────────────────────┘
           │                                       ▲
           │                                       │ stdio (existing MCP transport)
   ┌───────▼────────┐  ┌──────────────┐  ┌─────────┴──────────┐
   │  viem RPC      │  │  anvil PTY   │  │  Claude/Codex/Grok │
   │  (testnet,     │  │  (local      │  │  /Gemini/Cursor    │
   │  mainnet,      │  │  devnet)     │  │  /OpenCode agents  │
   │  local proxy)  │  └──────────────┘  └────────────────────┘
   └────────────────┘
```

## IPC contracts (packages/wire/src/monad.ts)

All inter-process types are Effect Schema. Renderer never talks to viem / anvil directly — it goes through `@effect/rpc` to `apps/server`, which holds the only `monad-core` runtime.

```ts
// Branded ids
type ChainId = number & { readonly _: unique symbol }
type Address = string & { readonly _: unique symbol }
type TxHash = string & { readonly _: unique symbol }
type NetworkId = "local" | "testnet" | "mainnet" | (string & { _: ... })

// Requests
DeployRequest:    { contract: string, constructorArgs: unknown[], network: NetworkId, value?: bigint }
CallRequest:      { address: Address, abi: AbiItem[], fn: string, args: unknown[], network: NetworkId, value?: bigint }
ReadRequest:      { address: Address, abi: AbiItem[], fn: string, args: unknown[], network: NetworkId }
SignMessageReq:   { message: string, network: NetworkId }
PublishRequest:   { projectPath: string, network: NetworkId, target: "ipfs" | "vercel" }

// Streams (server → renderer)
BlockHeightStream:  ChainId × NetworkId → Stream<bigint>
DevnetLogStream:    Stream<string>
TxStatusStream:     TxHash → Stream<"pending" | "mined" | "failed">
```

## Permissions model

Wallet / deploy / sign operations extend the existing permission system in `apps/server/src/policy.ts`. They are not a separate system.

| Permission kind | Default on local | Default on testnet | Default on mainnet |
|---|---|---|---|
| `monad.read` | auto-allow | auto-allow | auto-allow |
| `monad.write` (state-changing call) | auto-allow | ask | **always confirm + cooldown** |
| `monad.deploy` | auto-allow | ask | **always confirm + cooldown** |
| `monad.sign_message` | ask | ask | **always confirm** |
| `monad.export_private_key` | always confirm | always confirm | always confirm |
| `monad.publish` | n/a | ask | ask |

"Always confirm" means: no session-level "remember" option, the modal appears every time. See `decisions/0007-mainnet-guardrails.md`.

## Storage

### Keychain (existing credentials layer)
- `monad.wallet.<id>.privateKey` — burner private key, never logged, never sent over IPC except for signing
- `monad.walletconnect.<sessionId>` — WC session secret
- `monad.publish.web3storage.token` — IPFS upload token (optional, user provides)

### SQLite (existing DB)
- `monad_networks` — user-configured networks (id, chainId, rpcUrl, explorerUrl, isCustom)
- `monad_wallets` — wallet metadata (id, address, label, source: "burner" | "walletconnect"). No keys here.
- `monad_deploys` — deploy history (projectId, network, contract, address, txHash, blockNumber, deployedAt)
- `monad_config` — per-project config cache (projectId, monad_mode, configPath, frontendDir)

### Filesystem (in the user's project)
- `monad.config.json` — declares contracts, frontend dir, network defaults
- `frontend/src/contracts/addresses.ts` — codegen'd on each deploy
- `frontend/src/contracts/abis.ts` — codegen'd on each deploy
- `frontend/src/contracts/hooks.ts` — codegen'd wagmi v2 hooks

## Network defaults

Stored in `packages/monad-core/src/networks.ts`. Constants are placeholders to be filled with real Monad values during Phase 1 implementation.

```ts
export const NETWORKS = {
  local:   { chainId: 41454, rpcUrl: "http://127.0.0.1:8545",            explorerUrl: null },
  testnet: { chainId: TBD,   rpcUrl: "https://testnet-rpc.monad.xyz",    explorerUrl: "https://testnet-explorer.monad.xyz" },
  mainnet: { chainId: TBD,   rpcUrl: "https://rpc.monad.xyz",            explorerUrl: "https://explorer.monad.xyz" },
}
```

User can add custom networks via Settings → Monad → Networks.

## Security boundaries

1. **Private keys never leave `apps/server`.** Renderer requests "sign tx", server signs locally with the key fetched from keychain, returns signature.
2. **Mainnet writes always require an explicit modal**, even if the session has "auto-approve all" set. Cannot be turned off.
3. **MCP tools that mutate state require permission cards.** Agents cannot bypass; the permission system is the same code path the existing tools use.
4. **WalletConnect session secrets** are stored in keychain and dropped on session expiry.
5. **No telemetry of addresses, balances, or txs.** Opt-in metrics are aggregate counts only (e.g., "user deployed something").

## Failure modes & recovery

- **anvil port collision** → port-pick retry up to 5 times in 9000–9020 range; surface log if all fail.
- **forge missing** → banner with one-click install via `brew install foundry` (PTY command).
- **RPC down** → status indicator turns red, retries with exponential backoff, surfaces last error.
- **WalletConnect peer disconnect** → reconnect prompt; queued tx remains pending until reconnected or canceled.
- **Codegen overwrite of user-edited file** → codegen only writes files with a `// @generated` header. Refuses to overwrite files lacking the header.

## Why this architecture (vs. alternatives)

- **Why not a separate Electron app?** Reuses 100% of the chat / file / terminal / agent UX. Splitting would mean re-implementing all of it.
- **Why not a browser-based IDE (Remix-style)?** No local filesystem access for templates, no local devnet, no PTY, no keychain. The desktop app is the moat.
- **Why not put monad logic in `apps/server` directly?** Packages are transport-agnostic — same logic feeds the renderer (via @effect/rpc) and the MCP server (via stdio). Mirrors how `packages/index` was structured for the code index.
- **Why viem and not ethers?** Tree-shakeable, type-safe, matches wagmi v2 which is what the frontend templates use. See ADR 0002.
