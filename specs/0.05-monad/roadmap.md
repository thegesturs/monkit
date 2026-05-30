# Roadmap

Each phase ships independently as one PR and ends with an end-to-end demo.

**Current direction:** vibe-coder, full-stack, Convex-backed, templates-first. Phases 1–3 are built (RPC,
wallet, deploy interface). **Phase 0 (templates) is the new starting point** for the work ahead, followed by
the full-stack/Convex and Simple-mode phases.

| Phase | Title | Demo |
|---|---|---|
| 0 | **Templates first** | Scaffold a full-stack starter (contract + frontend + Convex) → it installs, deploys, and runs in the in-app browser |
| 1 | Foundations *(built)* | "Connected to testnet, block N" |
| 2 | Wallet + network *(built)* | Burner generated, switch networks, faucet on testnet works |
| 3 | Local devnet + compile + deploy *(interface built)* | Click Deploy → contract address in <5s on local |
| 4 | Frontend auto-wire | Deploy a Counter → frontend hot-reloads with new address |
| 5 | AI Monad tools + slash commands | Prompt: "deploy an ERC20" → agent does it end-to-end |
| 6 | Explorer + frontend publish | Build → shareable URL → QR → phone uses dApp |
| 7 | Convex backend (DB + auth) | Prompt "add a leaderboard" → Convex table fills, visible in the DB panel |
| 8 | Simple mode (vibe-coder UX) | First-run user ships a full-stack dApp without seeing a key, ABI, diff, or CLI |
| 9 | Project Plan panel | Agent plans a multi-step build → pinned checklist shows which step is live, "N of M Done" |

## Phase 0 — Templates first
**Goal:** A working full-stack starter exists and can be scaffolded in seconds. This is the foundation the
agent builds on and the first new slice to ship. See [features/templates.md](./features/templates.md).

- New `templates/` dir with a single bare starter, `fullstack-monad-convex` (no app-specific variants).
- Base skeleton: Foundry `contracts/` + Vite/React `frontend/` (wagmi v2 + viem) + `convex/` (schema + Convex Auth) + `AGENTS.md` + `monad.config.json`.
- New `workspace.scaffoldTemplate` RPC + handler + service (copy template → register project → install deps → spawn local devnet + local Convex backend). Reuses the existing folder-add path.
- Local Convex backend runs with no login wall (see [features/convex-backend.md](./features/convex-backend.md)).

**Done when:** pick a template → name it → it installs, the starter contract deploys to local, and the
frontend opens running in the in-app browser — no CLI.

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

**Done when:** end-to-end demo — `monad new my-app` from template → AI vibe-codes a feature → deploy → publish → open shareable URL on phone → connect mobile wallet → interact.

## Phase 7 — Convex backend (DB + auth)
**Goal:** Full-stack means a real backend. Offchain state lives in Convex, visible in-app, with auth working
out of the box. See [features/convex-backend.md](./features/convex-backend.md).

- Local Convex backend lifecycle (spawn/stop alongside the devnet); resolve local self-hosted vs cloud-dev provisioning first.
- In-app **Convex** right-pane panel (new `RightTab`) showing tables/rows/activity for the active project.
- Convex Auth wired in the template so "add login" is a prompt, not config.
- Agent applies the onchain/offchain split from `AGENTS.md` automatically.

**Done when:** prompt "add a leaderboard ranking players by score" → agent edits `convex/` + frontend → the
table fills as the user interacts → data is visible in the Convex panel, no backend setup by the user.

## Phase 8 — Simple mode (vibe-coder UX)
**Goal:** A first-time, non-developer user ships a full-stack dApp without seeing developer machinery. See
[features/simple-mode.md](./features/simple-mode.md).

- `simpleMode` setting (default on); hide PR + Changes tabs in `right-pane.tsx`.
- Plain-language labels, friendly errors, "what just happened" receipts.
- In-app browser auto-opens the running dApp after scaffold/deploy.
- Invisible toolchain onboarding ("Set me up" one-click install).

**Done when:** fresh user → one prompt → a running, shareable full-stack dApp, having never seen a key, ABI,
git diff, or terminal.

## Phase 9 — Project Plan panel
**Goal:** The agent follows a plan cleanly and the user always sees which step is happening now. See
[features/project-plan.md](./features/project-plan.md).

- Pinned Project Plan panel driven by the agent's existing `TodoWrite` stream (no new event type).
- Per-step status (done / in-progress / pending), current-step highlight, "N of M Done" counter, collapse.
- `AGENTS.md` + system preset teach the agent to plan first and update one step at a time.
- Simple mode suppresses the inline TodoWrite row so the panel is the single source of truth.

**Done when:** a multi-step prompt produces a visible ordered plan; exactly one step shows in-progress at a
time; completed steps check off and the counter advances.

## After 0.05

Possible follow-ups (out of scope for this MVP):
- **OpenClaw-style autonomous on-chain agents** (on-chain identity + auto wallet + Telegram bot + hosting) — explicitly deferred; secondary to the full-stack dApp loop.
- Partner-protocol building blocks (DEX / NFT mint / staking templates + MCP blueprints).
- Composer mode tabs beyond Full Stack Dapp (Program, Mobile, Games).
- Hardware wallet support (Ledger / Trezor); contract verification on the public Monad explorer.
- Forge test runner UI surface (currently usable via PTY terminal only).
- Multi-sig / Safe flows; cloud-shared dApp gallery.
