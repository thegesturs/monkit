# Phase 7 — Convex backend (DB + auth)

**Goal.** Full-stack means a real backend. Offchain state (accounts, sessions, profiles, leaderboards,
scores, mutable app data) lives in Convex, runs locally with no login wall, is visible in an in-app panel,
and the agent applies the onchain/offchain split automatically. Auth works out of the box.

See [features/convex-backend.md](../features/convex-backend.md).

## Scope

- Resolve the **provisioning decision** (local self-hosted vs cloud dev) — first task, blocks the rest.
- Local Convex backend lifecycle (spawn/stop alongside the devnet).
- In-app **Convex** right-pane panel (tables / rows / activity).
- Convex Auth wired in templates so "add login" is a prompt, not config.
- Agent applies the onchain/offchain split from `AGENTS.md`.

## Out of scope

- Convex MCP tools (`convex_query`, `convex_run`) — possible follow-up, not v1.
- File storage / large blobs in Convex.
- Cloud-shared / multi-project Convex deployments (beyond the optional publish link).

## Critical files

- `packages/monad-core/src/convex.ts` (new) — local backend lifecycle (start/stop/status), mirrors
  `devnet.ts`.
- `apps/server/src/monad/layer.ts` — add a `Convex` service to the layer graph.
- `apps/server/src/services/` — reuse PTY infra for the Convex process.
- `apps/renderer/src/store/ui.ts` — add `"convex"` to the `RightTab` union.
- `apps/renderer/src/components/right-pane.tsx` — add the Convex tab button + render block.
- `apps/renderer/src/components/convex-panel.tsx` (new) — the panel (embed dashboard in the in-app
  `<webview>`, or query the dev deployment directly).
- `apps/renderer/src/components/browser-pane.tsx` — reuse the `<webview>` for the embedded dashboard.
- `templates/*/convex/` — `schema.ts`, `auth.config.ts`, example functions (authored in Phase 0, exercised
  here).
- `packages/wire/src/` — `ConvexStatus`, `ConvexTablesRequest` (if querying natively).

## Implementation steps

1. **Provisioning spike (blocking).** Validate running the self-hosted open-source Convex backend on macOS
   (binary vs Docker) with no account/login. Decide:
   - **Preferred:** local self-hosted backend, spawned by the app like anvil; data on disk; zero login.
   - **Fallback:** cloud dev deployment with auth handled silently (only if self-host is too heavy for v1).
   - Record the outcome in a new ADR `decisions/0008-convex-local-vs-cloud.md`.

2. **`monad-core/convex.ts`.**
   - `ensureRunning(projectPath)`: idempotent; start the local backend + `convex dev` for the project,
     stream logs to a "Convex" terminal entry. Port-pick to avoid clashes.
   - Auto-restart on crash (max 3 in 60s). SIGTERM on app quit.
   - `status()` → `{ running, deploymentUrl, dashboardUrl }`.
   - Inject the deployment URL into the frontend env so `convex-client.ts` connects.

3. **Layer wiring.** Add the `Convex` service to `apps/server/src/monad/layer.ts`; start it during the
   scaffold post-setup (Phase 0 step 4) and on project open.

4. **Convex panel.**
   - Add `"convex"` to `RightTab`; add the tab button (database icon) + render block in `right-pane.tsx`.
   - `convex-panel.tsx`: simplest path embeds `dashboardUrl` in the in-app `<webview>`. Show running/
     stopped status and a "restart backend" affordance.

5. **Auth.** Confirm Convex Auth in the template gives working anonymous/session login. "Add Google login"
   / "add wallet login" become prompts; upstream provider secrets go through the keychain credentials layer,
   never the repo.

6. **Agent split.** Ensure `AGENTS.md` (Phase 0) instructs the agent to put accounts/leaderboards/profiles
   in Convex and keep onchain minimal. Validate on the leaderboard prompt below.

## Verification

1. Scaffold `fullstack-monad-convex` → the local Convex backend starts with **no
   login prompt**; the frontend connects and Convex-backed widgets leave the "backend starting…" state.
2. Open the **Convex** panel → tables are listed; interacting with the app (e.g. submitting a score) adds
   rows visible live.
3. Prompt: "add a leaderboard ranking players by how many times they've called increment()." → agent edits
   `convex/schema.ts` + a query/mutation + the frontend; count stays onchain, leaderboard lands in Convex;
   data appears in the panel.
4. App quit → Convex backend (and devnet) shut down cleanly; relaunch → both come back; data persists.
5. Auth: a sign-in flow works in the running app without the user configuring a provider.

## PR scope

Likely two PRs: `feat(monad): local Convex backend lifecycle + panel (#NNN)` and `feat(monad): Convex auth +
agent offchain split (#NNN)`. Each diff < ~2500 LOC. The provisioning ADR lands with the first.
