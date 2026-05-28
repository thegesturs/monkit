# Feature: Permissions (Monad operations)

## Why

State-changing on-chain ops cost money and are irreversible. The permission system must surface them, but not nag for local devnet ops (which would kill the vibe). Mainnet must be impossible to spam.

## Reuse

We extend `apps/server/src/policy.ts`. New permission kinds added to the existing schema, the existing permission card component renders them. No new UI primitives.

## Permission kinds

| Kind | Trigger | Default behavior by network |
|---|---|---|
| `monad.read` | Any view/pure call | always auto-allow |
| `monad.write` | State-changing call | local: auto / testnet: ask / mainnet: always-confirm |
| `monad.deploy` | Contract deploy | local: auto / testnet: ask / mainnet: always-confirm |
| `monad.sign_message` | Personal sign | local: ask / testnet: ask / mainnet: always-confirm |
| `monad.export_private_key` | Export burner key | always always-confirm |
| `monad.publish` | Frontend publish | n/a / testnet: ask / mainnet: ask |
| `monad.switch_network` | Programmatic network change | always ask if active session has set explicit network |

## "Always-confirm" semantics

When a permission is `always-confirm`:
- The card shows up every time (no "remember for session" option).
- A 1-second mandatory delay before the confirm button is enabled (prevents accidental double-click).
- For writes: the card shows decoded function name, args, value, estimated gas, and the active wallet address.
- For deploys: the card shows contract name, network, deployer address.
- For sign-message: the card shows the full message in monospace.

## Cooldown

Mainnet writes have a 5-second cooldown between sends per wallet. Spam-clicks queue, not fire-and-forget.

## Settings

Per-project, per-network overrides:

- `local.autoAllow`: { write: true, deploy: true, sign: false } (defaults).
- `testnet.autoAllow`: { write: false, deploy: false, sign: false }.
- `mainnet.autoAllow`: locked to always-confirm; cannot be turned off.

## Auditing

Every permission decision (auto or interactive) is logged to the existing session audit log. Mainnet events also append to a per-project `monad_audit.log` file (plaintext, append-only) outside the SQLite DB so the user has a portable record.

## Out of scope

- Per-contract / per-function granular permissions — defer.
- Time-of-day restrictions ("no mainnet after midnight") — defer.
- Org-level policy (multi-user) — desktop is single-user.
