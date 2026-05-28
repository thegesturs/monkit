# Roadmap

Six phases, each ships independently as one PR, each ends with an end-to-end demo.

| Phase | Title | Demo |
|---|---|---|
| 1 | Foundations | Toggle Monad mode → see "connected to testnet, block N" |
| 2 | Wallet + network | Burner generated, switch networks, faucet on testnet works |
| 3 | Local devnet + compile + deploy | Click Deploy → contract address in <5s on local |
| 4 | Frontend auto-wire | Deploy a Counter → frontend hot-reloads with new address |
| 5 | AI Monad tools + slash commands | Prompt: "deploy an ERC20" → agent does it end-to-end |
| 6 | Explorer + frontend publish | Build → IPFS → share QR → phone uses dApp |

## Phase 1 — Foundations
**Goal:** Plumbing exists. Renderer can see the Monad mode tab group. RPC roundtrips work.

- `packages/monad-core` skeleton with `networks.ts`, `rpc.ts` (viem PublicClient).
- `packages/wire/src/monad.ts` typed RPC contracts.
- New SQLite columns on `projects`: `monad_mode`, `monad_config_path`.
- Renderer: project settings toggle for Monad mode. Right pane shows a placeholder "Monad" tab group when enabled.
- Block-height indicator pulling `eth_blockNumber` against the active network.

**Done when:** toggle Monad mode → see new tab group → see live block height ticking on Monad testnet.

## Phase 2 — Wallet + network
**Goal:** Users have a wallet. They can switch networks. They can request testnet funds.

- `monad-core/wallet.ts` burner generation (viem `generatePrivateKey`).
- Burner stored via existing keychain credentials layer; metadata in `monad_wallets`.
- WalletConnect v2 bridge for real wallets.
- `NetworkSwitcher` UI: Local / Testnet / Mainnet (mainnet hidden behind setting).
- `WalletPanel`: address, balance, label, faucet button (testnet only).
- Sign message flow with permission card.
- Mainnet guardrails: confirm modal, no "remember" option, cooldown.

**Done when:** new burner created → switch Local↔Testnet → balance reflects active network → request testnet funds → sign a no-op message.

## Phase 3 — Local devnet + compile + deploy
**Goal:** From a Foundry project, a single click compiles and deploys to local or testnet.

- `monad-core/devnet.ts`: spawn anvil with Monad chain id via existing PTY infra. Port pick. Auto-restart. Clean shutdown on app quit.
- Foundry detection. If missing, banner with one-click `brew install foundry`.
- `monad-core/compile.ts`: wrap `forge build`, parse artifact JSON, surface errors with file:line as composer @-mentions.
- `monad-core/deploy.ts`: pick contract → ABI-driven constructor arg form → deploy → return tx hash + address.
- `DeployHistoryList`: persisted per-project deploys in `monad_deploys` table.

**Done when:** open a Foundry project with Monad mode → click Deploy → contract address in <5s on local; same flow on testnet.

## Phase 4 — Frontend auto-wire + ABI bindings
**Goal:** Every deploy updates the frontend with no manual ABI copying.

- `monad-core/codegen.ts`: on deploy, write `frontend/src/contracts/{addresses.ts, abis.ts, hooks.ts}` (wagmi v2 hooks). All files start with `// @generated`.
- `monad.config.json` in project root declares contracts and frontend dir.
- `ContractFunctionForm`: ABI-driven panel. Read functions show "Call", write show "Send", events show subscription.
- Frontend dev server runner integrated with existing terminal pane (status chip in right pane).

**Done when:** deploy a Counter → TS bindings appear in frontend → call `increment()` from the in-app UI → frontend hot-reloads with the new address.

## Phase 5 — AI Monad tools + slash commands
**Goal:** The AI agent can drive the full flow end-to-end with no user clicks.

- `apps/mcp-server/src/tools/monad.ts`: register `monad_deploy`, `monad_call`, `monad_read`, `monad_balance`, `monad_estimate_gas`, `monad_sign_message`, `monad_get_address`, `monad_get_network`. Same registration pattern as `code_search`.
- Permission policy extended: writes/signs go through permission card; auto-allow on local, ask on testnet, always-confirm on mainnet.
- Composer slash commands: `/deploy <contract>`, `/call <fn>`, `/read <fn>`, `/switch-net <id>`, `/wallet new|import|export|switch`.
- "Vibe-code a contract" intent template: pre-loads the agent with target paths + tool docs + a "deploy + interact when ready" instruction.

**Done when:** prompt "make me an ERC20 called WAGMI, deploy to local, mint 1000 to my burner, then call balanceOf" → agent edits → compiles → deploys → calls → reports balance, all visible in the chat timeline.

## Phase 6 — Explorer + frontend publish
**Goal:** Users can see what happened on-chain and share their dApp.

- `ExplorerPanel`: local-indexed view of project tx history. Decodes logs against known ABIs from deploy history. Link-out to public Monad explorer for non-local txs.
- `monad-core/publish.ts`: `vite build` (or `next build && next export`), upload to web3.storage by default. Optional Vercel CLI if `vercel` on PATH.
- "Share dApp" button → IPFS gateway URL + QR code.
- `monad_publish` MCP tool — agent can publish too.
- Template polish: starter templates ship working Counter / ERC20 / NFT examples + pre-wired wagmi v2 frontend.

**Done when:** end-to-end demo — `monad new my-app` from template → AI vibe-codes a feature → deploy → publish → open IPFS URL on phone → connect mobile wallet → interact.

## After 0.05

Possible Phase 7+ follow-ups (out of scope for this MVP):
- Hardware wallet support (Ledger / Trezor)
- Contract verification on the public Monad explorer
- Forge test runner UI surface (currently usable via PTY terminal only)
- Multi-sig / Safe flows
- Cloud-shared dApp gallery
