# Feature: Convex offchain backend (DB + auth)

## Why

A real dApp is more than a contract. It needs accounts, sessions, profiles, leaderboards, scores, and
mutable app state — none of which belong onchain (too slow, too expensive, public by default). The vibe
coder should never set up a database, write auth, or configure APIs. We give every full-stack template a
**Convex** backend, auto-provisioned, with a live in-app view of the data.

Convex is a TypeScript reactive backend: schema + query/mutation/action functions + realtime subscriptions,
all in a `convex/` directory the agent edits like any other code.

## On-chain vs off-chain split (the rule the agent follows)

Encoded in template `AGENTS.md` so the agent applies it automatically:

| Onchain (Solidity) | Offchain (Convex) |
|---|---|
| Value, ownership, balances | User accounts, sessions, auth |
| Trust-critical logic, settlement | Profiles, display names, avatars |
| Token / NFT state | Leaderboards, scores, match history |
| Anything others must verify | Feeds, comments, mutable app data |

Canonical example: a counter/score onchain where it matters, with the leaderboard + profiles in Convex —
the kind of thing the agent builds on top of the bare starter.

## What ships in the template

- `convex/schema.ts` — `defineSchema` / `defineTable` for the offchain tables (e.g. `users`, `scores`).
- `convex/auth.config.ts` — **Convex Auth** wired so "add login" works without the user touching
  providers or keys. Default: anonymous/session auth that can be upgraded to wallet- or email-based later.
- `convex/*.ts` — example query + mutation (e.g. `leaderboard.list`, `scores.submit`).
- `frontend/src/convex-client.ts` — `ConvexReactProvider` wiring; `App.tsx` shows a live query.
- `convex.json` — deployment config (see provisioning below).

## Provisioning — local-first (the key decision)

To keep the "understand nothing, nothing leaves the machine" promise, **default to a self-hosted Convex
backend running locally**, mirroring how the local anvil devnet works for the chain:

- App manages a local Convex backend (self-hosted open-source Convex) the way it manages anvil — spawned in
  the background on scaffold, via the existing PTY infra.
- No Convex account, no browser login wall, no cloud dependency for local development.
- `convex dev` points the frontend at the local deployment; data lives on the user's machine.
- **Optional cloud link** for publishing: when the user publishes a dApp (see
  [frontend-deploy.md](./frontend-deploy.md)), offer linking a hosted Convex deployment so the shared URL
  has a backend. This is opt-in, not required to build locally.

> Open item to validate during implementation: bundling/running the self-hosted Convex backend cleanly on
> macOS (binary vs Docker). If self-hosting proves too heavy for v1, fall back to a cloud dev deployment with
> auth handled silently — but the local-first model is strongly preferred for the privacy + zero-login story.
> This is the single biggest unknown for the zero-understanding goal; resolve it first in the Convex phase.

## In-app Convex DB panel

A new right-pane tab so users "see DB details locally" without leaving the app:

- Add `"convex"` to the `RightTab` union in `apps/renderer/src/store/ui.ts`.
- Add a tab button + render block in `apps/renderer/src/components/right-pane.tsx` (database icon).
- New `apps/renderer/src/components/convex-panel.tsx`. Simplest path: embed the local Convex dashboard in
  the existing in-app browser `<webview>` (see `browser-pane.tsx`). Alternative: query the dev deployment
  directly and render tables natively.
- Shows tables, rows, and recent function activity for the active project's local deployment.

## Agent / MCP considerations

- The agent edits `convex/` files directly (normal Edit tool) and runs Convex via the terminal — no new MCP
  tool strictly required for v1.
- Possible follow-up MCP tools (defer): `convex_query`, `convex_run`, `convex_tables` so the agent can read
  data and verify state the same way `monad_read` verifies onchain state.

## Auth

Convex Auth in the template covers sign-in/sessions. The vibe coder gets working login out of the box;
"add Google login" / "add wallet login" become prompts, not config tasks. Keys/secrets for any upstream
provider are stored via the existing keychain credentials layer, never in the repo.

## Out of scope

- File storage / large blobs in Convex — defer unless a template needs it.
- Cross-project shared Convex deployments — defer.
- Migrating existing non-Convex backends — out of scope.

## Related

- [templates.md](./templates.md) — the templates that wire Convex in.
- [simple-mode.md](./simple-mode.md) — the vibe-coder surface that exposes the Convex panel.
- [frontend-deploy.md](./frontend-deploy.md) — optional cloud Convex link at publish time.
