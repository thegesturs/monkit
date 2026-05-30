# Phase 0 — Templates first

**Goal.** A working full-stack starter exists in the repo and can be scaffolded into a new project in
seconds. The starter contract deploys to local and the frontend opens running in the in-app browser — no
CLI, no manual setup. This is the foundation the agent builds on and the first new slice to ship.

See [features/templates.md](../features/templates.md).

## Scope

- A `templates/` directory shipped with the app: `fullstack-monad-convex` (base) + `nft-mint`,
  `erc20-launchpad`, `onchain-mini-app`.
- `workspace.scaffoldTemplate` RPC: copy template → register project → install deps → spawn local devnet →
  write `monad.config.json` → (optional) auto-deploy starter contract + open frontend in the in-app browser.
- Bootstrap UI entry: "Start from a template" (new project flow + menu item).
- Template `AGENTS.md` teaching the agent the project shape and the onchain/offchain split.

## Out of scope

- Convex backend **runtime** (local lifecycle, panel, auth) — Phase 7. The template ships `convex/` files,
  but its Convex-backed widgets degrade gracefully until Phase 7 lights up the backend.
- Simple mode UI hiding — Phase 8.
- Frontend publish to a shareable URL — Phase 6.
- Template marketplace / Next.js variant / mobile — deferred.

## Critical files

- `templates/` (new top-level dir) — the four template trees.
- `apps/server/src/workspace/handlers.ts` — add a `ScaffoldTemplate` handler (mirrors `Add`).
- `apps/server/src/workspace/layers/workspace-service.ts` — implement copy + register + post-scaffold setup.
- `apps/renderer/src/store/workspace.ts` — add `scaffoldFromTemplate(template, name)` action (today's
  `add()` is the reference path: `pickFolder` → `workspace.add`).
- `packages/wire/src/` (workspace contracts) — add `ScaffoldTemplateRequest` + `TemplateId` schema.
- `apps/server/src/monad/layer.ts` + `packages/monad-core/src/devnet.ts` — reuse devnet auto-spawn.
- PTY / terminal service (`apps/server/src/services/`) — run `bun install` / `forge install` in background.
- `apps/desktop/src/menu.ts` — "New from template…" menu entry.
- `apps/renderer/src/components/onboarding/` — wire template pick into the wizard's "first project" step.

## Implementation steps

1. **Author the base template `templates/fullstack-monad-convex/`.**
   - Skeleton per [features/templates.md](../features/templates.md): `contracts/` (Foundry, `Counter.sol`
     + `Counter.t.sol`, `foundry.toml`, `remappings.txt`), `frontend/` (Vite + React + wagmi v2 + viem,
     `src/contracts/` codegen target, `wagmi-config.ts`, `convex-client.ts`), `convex/` (`schema.ts`,
     `auth.config.ts`, an example query + mutation), `monad.config.json`, `convex.json`, `package.json`
     (bun workspaces), `AGENTS.md`, `README.md`.
   - Frontend renders without a live Convex backend: gate Convex-backed widgets behind a "backend starting…"
     state so Phase 0 demos a running app.

2. **Author the three variants.** Each is the base with the contract + UI swapped:
   - `nft-mint`: `MyNFT.sol` (ERC-721) + a mint page.
   - `erc20-launchpad`: `Token.sol` (ERC-20) + a launchpad page.
   - `onchain-mini-app`: a tipping/counter contract + a leaderboard UI whose data layer targets Convex
     (the showcase for Phase 7).

3. **Wire types.** `TemplateId = "fullstack-monad-convex" | "nft-mint" | "erc20-launchpad" | "onchain-mini-app"`;
   `ScaffoldTemplateRequest { template: TemplateId, name: string, parentDir?: string }`.

4. **`workspace.scaffoldTemplate` service.**
   - Resolve destination `parentDir/name` (default to the app's projects dir; error if exists).
   - Recursively copy the template tree (skip `node_modules`, `out`, `.git`).
   - Register the project (same `projects` insert as `add`); Monad is always-on (no toggle).
   - Write `monad.config.json` (contracts, `frontendDir`, networks default `local`).
   - Kick off background install in a dedicated terminal: `bun install`, `forge install foundry-rs/forge-std`.
   - Spawn the local devnet (`monad-core/devnet.ts ensureRunning("local")`).
   - Return `{ projectId, path }` plus a progress stream id so the renderer can show setup state.

5. **Server handler + renderer action.** Add `ScaffoldTemplate` handler; add `scaffoldFromTemplate` to the
   workspace store; surface a template picker (grid of the four, with one-line descriptions).

6. **Optional auto-start (behind a default-on checkbox).** After install completes: compile + deploy the
   starter contract to local (reuse Phase-3 deploy), then start the frontend dev server (reuse Phase-4
   `frontend.ts`) and open it in the in-app browser (`browser-pane.tsx`).

7. **Onboarding + menu entry.** "Start from a template" in the wizard's first-project step and in the app
   menu; picking one runs `scaffoldFromTemplate`.

## Verification

1. New project → "Start from a template" → pick `fullstack-monad-convex` → name it → it scaffolds; install
   runs in a background terminal; devnet is up within ~3s.
2. With auto-start on: the starter `Counter` deploys to local and the frontend opens **running** in the
   in-app browser; clicking the UI works against local devnet.
3. `frontend/src/contracts/` is populated by codegen on the auto-deploy (Phase-4 path).
4. `AGENTS.md` is present at the project root; opening an agent session, the agent correctly describes the
   project as a Monad dApp with Convex offchain and uses `monad_deploy` when asked to deploy.
5. Each of the other three templates scaffolds and its frontend renders (Convex widgets show "backend
   starting…" — full data flow validated in Phase 7).
6. Scaffolding into an existing directory name errors cleanly.

## PR scope

One PR titled `feat(monad): starter templates + scaffold path (#NNN)`. Diff < ~3000 LOC (most of it template
files). Convex runtime intentionally excluded — Phase 7.
