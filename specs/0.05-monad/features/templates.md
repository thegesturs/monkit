# Feature: Starter templates (build these first)

## Why

Vibe coding starts from a working baseline, not an empty directory. Templates do three things:

1. Give the user a **running full-stack dApp** in seconds (contract + frontend + backend), not a blank repo.
2. Teach the AI the project shape — the agent reads the template and `AGENTS.md`, then mimics it. This is
   how the agent "knows Monad" without anything hardcoded in the agent itself.
3. Let the agent **quick-start** instead of re-scaffolding the whole stack on every new project.

**Templates are Milestone 0 — the foundation everything else builds on. Build them before the
one-prompt loop, before the UX work.** A working template + a scaffold path is the first shippable slice.

## Templates shipped

All four share one skeleton (below); the focused variants extend the base.

| Template | What it is | Convex |
|---|---|---|
| **`fullstack-monad-convex`** (default / base) | Foundry contract + Vite/React + wagmi/viem frontend + Convex backend (DB + auth), fully wired | ✅ DB + auth |
| **`nft-mint`** | ERC-721 + a mint UI; extends base | optional (metadata, allowlist) |
| **`erc20-launchpad`** | ERC-20 + a token-launchpad UI; extends base | optional |
| **`onchain-mini-app`** | Small contract (tipping / counter) + UI, with **leaderboard / profiles / scores in Convex** — the showcase for offchain state alongside onchain | ✅ showcases offchain state |

The base is the superset. `nft-mint` / `erc20-launchpad` swap the contract + UI and may drop Convex if a
variant is purely onchain. `onchain-mini-app` is the one that proves the on/offchain split.

## Shared skeleton (`fullstack-monad-convex`)

```
my-app/
  contracts/                  # Foundry
    Counter.sol               # or Token.sol / MyNFT.sol per variant
    foundry.toml
    remappings.txt
  test/
    Counter.t.sol             # forge test runs pre-deploy (the safety incumbents lack)
  convex/                     # Convex backend (TypeScript)
    schema.ts                 # defineSchema/defineTable — offchain tables
    auth.config.ts            # Convex Auth config
    *.ts                      # queries / mutations / actions
  frontend/
    src/
      contracts/              # @generated codegen target (addresses.ts, abis.ts, hooks.ts)
      main.tsx
      App.tsx                 # uses generated wagmi hooks + Convex React client
      wagmi-config.ts         # wagmi v2 config with Monad chains
      convex-client.ts        # ConvexReactProvider wiring
    package.json              # vite, react, wagmi, viem, convex
    vite.config.ts
    index.html
  monad.config.json           # networks, contracts, frontendDir (see monad-mode.md)
  convex.json                 # Convex project config (deployment target)
  package.json                # bun workspaces root (contracts + frontend + convex)
  AGENTS.md                   # AI instructions (below)
  README.md
```

The onchain piece stays minimal; user accounts, sessions, leaderboards, profiles, and scores live in
Convex. See [convex-backend.md](./convex-backend.md) for the on/offchain split and the in-app DB panel.

## AGENTS.md (template-level AI instructions)

Project root, read by all bundled agents at session start:

- "This is a Monad dApp. Contracts in `contracts/` (Foundry). Frontend in `frontend/` (Vite + React +
  wagmi v2 + viem). Offchain backend in `convex/` (Convex: DB + auth)."
- "Use `monad_deploy` to deploy, `monad_call` / `monad_read` to interact. **Never copy-paste an address** —
  `frontend/src/contracts/addresses.ts` is auto-generated on deploy."
- "Put user accounts, sessions, leaderboards, profiles, scores, and any mutable app data in **Convex**, not
  onchain. Onchain is for value, ownership, and trust-critical logic only."
- "Prefer Foundry idioms (`forge build`, `forge test`). The dev environment runs a local devnet
  automatically. Run `forge test` before deploying."
- Example prompts the user might type.

## Scaffolding path

New RPC `workspace.scaffoldTemplate({ template, name, parentDir })`, alongside the existing folder-add flow:

- Renderer: extend `apps/renderer/src/store/workspace.ts` (today's `add()` calls `workspace.pickFolder` +
  `workspace.add`). Add a `scaffoldFromTemplate(template, name)` action.
- Server handler: add to `apps/server/src/workspace/handlers.ts` (mirrors the `Add` handler).
- Server service: extend `apps/server/src/workspace/layers/workspace-service.ts` to (1) copy the template
  dir to `parentDir/name`, (2) register the project (same `projects` insert as `add`), (3) kick off
  `bun install` + `forge install foundry-rs/forge-std` + Convex setup in the background terminal pane,
  (4) auto-spawn the local devnet, (5) write `monad.config.json`.
- Templates live in a new repo dir `templates/<name>/` (none exists yet), shipped with the app bundle.

## Bootstrap UX

- New project → "Start from a template" → pick template → name → directory (or default location).
- Scaffolding copies files and runs install + Convex dev + devnet spawn in the background (progress in the
  terminal pane, but the user just sees a "Setting up your app…" state — see [simple-mode.md](./simple-mode.md)).
- Monad is always on (no toggle in the fork — see [README](../README.md)).
- Optional: auto-deploy the starter contract and open the running frontend in the in-app browser, so the
  user sees a live app immediately.

## Customization

Templates are vanilla files. No manifest tracks "template-owned" files — once scaffolded, the project is
the user's to edit. The agent edits them like any other code.

## Out of scope

- Template marketplace / community templates — defer.
- Templates for other chains — Monad-only.
- React Native / mobile templates — defer (a later composer mode).
- Next.js variant — fold into a follow-up once the Vite base is solid (publish needs `output: export`).

## Related

- [convex-backend.md](./convex-backend.md) — the Convex layer these templates wire in.
- [frontend-deploy.md](./frontend-deploy.md) — publishing the frontend to a shareable URL.
- [onboarding.md](./onboarding.md) — invisible toolchain install before first scaffold.
