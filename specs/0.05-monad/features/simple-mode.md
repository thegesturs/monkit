# Feature: Simple mode (vibe-coder UX)

## Why

The target user has never touched Monad and may not be a developer. They should ship a working full-stack
dApp without ever seeing a private key, an ABI, a git diff, or a pull request. Simple mode is the default
experience: the app **manages everything and hides the developer machinery**, surfacing only what a vibe
coder needs — their app running, and a plain-language account of what happened.

Advanced users flip one toggle to get the full developer surface back.

## Default = Simple

- New setting `simpleMode: boolean`, **default `true`**, in `apps/renderer/src/store/settings.ts` and the
  server `SettingsFile` (in `@memoize/wire`). Setter `setSimpleMode`, persisted via `settings.update`.
- A toggle in Settings ("Show developer tools" / Advanced) flips it off to reveal everything.

## What Simple mode hides

In `apps/renderer/src/components/right-pane.tsx`, conditionally drop the tab buttons **and** render blocks
for the developer-only tabs (the `RightTab` union lives in `apps/renderer/src/store/ui.ts`):

- **PR** tab — vibe coders don't open pull requests. Hidden.
- **Changes** (git diff) tab — hidden. (Git still runs underneath; the user just doesn't manage it.)

Kept in Simple mode (the vibe coder's actual surface):

- **In-app browser** (`browser-pane.tsx`) — the primary way to test the running dApp. After scaffold/deploy,
  auto-open the local dev server here so the user immediately sees their app.
- **Convex** DB panel — see their data (see [convex-backend.md](./convex-backend.md)).
- **Wallet / Deploy / Explorer** Monad panels — but with plain-language labels (below).
- **Files** and **Terminal** — kept, but de-emphasized; they're not where the vibe coder lives.

## Plain-language everywhere

- Labels: "test money" not faucet/gas · "your app's wallet" not burner · "private / testing / live network"
  not local/testnet/mainnet.
- **Errors**: wrap raw RPC / forge / Convex errors in a human explanation + a suggested next action. Never
  show a raw stack trace in Simple mode (it's available in Terminal / Advanced).
- **"What just happened" receipts**: after a deploy or publish, a friendly card — what was created, where it
  lives, and a link — instead of a bare tx hash. (Maps onto the existing deploy-history / receipt surfaces.)

## Test loop (no terminal required)

Scaffold → contract auto-deploys to local → frontend dev server runs → the in-app browser opens it. The
user clicks around their live app. No CLI, no localhost-copy-paste. This is the core "manage everything for
them" loop.

## Interaction with onboarding

The invisible-toolchain onboarding (see [onboarding.md](./onboarding.md)) runs in Simple mode by default:
one "Set me up" button, plain-language progress, ending in a running starter app.

## Out of scope

- Per-tab granular hide/show preferences — one Simple/Advanced switch for v1.
- Removing git entirely — git keeps running for safety/history; it's just not surfaced.
- A separate "kid mode" / further-simplified tier — defer.

## Related

- [templates.md](./templates.md) · [convex-backend.md](./convex-backend.md) · [onboarding.md](./onboarding.md)
