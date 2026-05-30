# Phase 8 — Simple mode (vibe-coder UX)

**Goal.** A first-time, non-developer user ships a full-stack dApp without ever seeing developer machinery —
no PR tab, no git diffs, no raw errors, no CLI, no private key. Simple mode is the default; one toggle
restores the full developer surface.

See [features/simple-mode.md](../features/simple-mode.md).

## Scope

- `simpleMode` setting (default `true`) + Advanced toggle.
- Hide the **PR** and **Changes** right-pane tabs in Simple mode.
- Plain-language labels for crypto terms; friendly error wrapping; "what just happened" receipts.
- In-app browser auto-opens the running dApp after scaffold/deploy.
- Invisible toolchain onboarding ("Set me up" one-click install).

## Out of scope

- Per-tab granular preferences (one Simple/Advanced switch for v1).
- Removing git (it keeps running underneath; just not surfaced).
- Further-simplified tiers.

## Critical files

- `apps/renderer/src/store/settings.ts` — add `simpleMode: boolean` + `setSimpleMode`.
- `packages/wire/src/` (`SettingsFile`) — add `simpleMode` to the persisted settings schema.
- `apps/renderer/src/components/right-pane.tsx` — conditionally render PR + Changes tab buttons and blocks.
- `apps/renderer/src/components/settings-page.tsx` — "Show developer tools" (Advanced) toggle.
- `apps/renderer/src/components/monad/` — label/copy pass on wallet/deploy/network panels; receipts.
- Error surfaces (deploy/compile/Convex result handlers) — wrap raw errors in friendly messages.
- `apps/renderer/src/components/onboarding/` — "Set me up" invisible toolchain install step.
- `apps/renderer/src/components/browser-pane.tsx` — auto-open the running dApp URL.

## Implementation steps

1. **Setting.** Add `simpleMode` (default `true`) to `SettingsFile` (wire) + the renderer settings store;
   persist via `settings.update`. Add the Advanced toggle in `settings-page.tsx`.

2. **Hide dev tabs.** In `right-pane.tsx`, gate the `"pr"` and `"changes"` tab buttons **and** their render
   blocks on `!simpleMode`. If the active tab becomes hidden, fall back to a sensible default (e.g. the
   in-app browser).

3. **Plain-language labels.** Replace surfaced crypto terms in Simple mode: "test money" (faucet/gas),
   "your app's wallet" (burner), "private / testing / live network" (local/testnet/mainnet). Keep technical
   terms in Advanced.

4. **Friendly errors.** Wrap raw RPC / forge / Convex errors with a human explanation + a suggested next
   action. Never show a raw stack trace in Simple mode (still available in Terminal / Advanced).

5. **Receipts.** After deploy/publish, render a "what just happened" card (what was created, where it lives,
   a link) instead of a bare tx hash. Hook into the existing deploy-history / publish-result surfaces.

6. **Test loop.** After scaffold/deploy, auto-open the running frontend in the in-app browser so the user
   immediately sees their app — no localhost copy-paste.

7. **Invisible onboarding.** One "Set me up" button auto-installs Foundry/Node/Bun via PTY with
   plain-language progress (extends [features/onboarding.md](../features/onboarding.md)); end state is a
   running starter app.

## Verification

1. Fresh launch defaults to Simple mode: the right pane shows no **PR** or **Changes** tab.
2. Toggle Advanced in Settings → PR + Changes reappear; toggle back → they hide.
3. Scaffold a template → after setup, the running dApp auto-opens in the in-app browser; the user clicks
   around without touching a terminal.
4. Trigger a deploy error (e.g. no funds) → a friendly message + next-action appears, not a raw RPC dump.
5. Successful deploy → a "what just happened" receipt with a link, not a bare hash.
6. Crypto terms read in plain language in Simple mode; technical labels return in Advanced.
7. End-to-end: a first-time user, one prompt, reaches a running full-stack dApp having seen no key, ABI,
   git diff, or CLI.

## PR scope

One PR titled `feat(monad): simple mode + vibe-coder UX (#NNN)`. Diff < ~2000 LOC. Onboarding install polish
may split into a follow-up.
