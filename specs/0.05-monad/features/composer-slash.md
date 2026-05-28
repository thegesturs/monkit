# Feature: Composer slash commands

## Why

Some Monad operations are faster from the keyboard than the UI. Slash commands give power users a CLI feel inside the chat composer, and produce the same audit log as button clicks.

## Commands

Registered in `apps/renderer/src/composer/slash/monad-commands.ts`. Loaded only when the session's project has Monad mode enabled.

| Command | Action |
|---|---|
| `/deploy <contract> [args...]` | Compile + deploy via the same path as the Deploy button |
| `/call <address> <fn> [args...]` | Call a state-changing function |
| `/read <address> <fn> [args...]` | Read a view/pure function |
| `/balance [address]` | Show balance of given address or active wallet |
| `/sign <message>` | Personal-sign a message |
| `/switch-net <local|testnet|mainnet|id>` | Change session active network |
| `/wallet new [label]` | Create new burner |
| `/wallet switch <id|address>` | Change active wallet |
| `/wallet import` | Open key import modal |
| `/wallet export` | Open key export modal (always-confirm) |
| `/wallet list` | List wallets |
| `/faucet [address]` | Request testnet funds |
| `/publish [ipfs|vercel]` | Publish frontend |
| `/devnet status` | Status of local anvil |
| `/devnet restart` | Kill + respawn local anvil |
| `/networks` | List configured networks |

## Resolution rules

- Address args accept: `0x…` literal, contract name (resolved against deploy history), `me` (active wallet), `burner:<label>`.
- ABI args: parsed as JSON if start with `[`, `{`, `"`. Otherwise heuristic: numeric → bigint, `true`/`false` → bool, else string.
- Missing required args → composer opens the corresponding form UI pre-filled with what was parsed.

## Permission UX

Same as MCP tools. Local auto-allow, testnet ask, mainnet always-confirm.

## Autocomplete

Composer autocomplete (existing) extends with:

- Network ids after `/switch-net`.
- Wallet labels after `/wallet switch`.
- Contract names after `/deploy`, `/call`, `/read` (from the project's compiled artifacts).
- Function names after `<address> ` in `/call` and `/read` (from that contract's ABI).

## Out of scope

- Piping output between slash commands (`/read x | /call y …`) — defer.
- Custom user-defined aliases — defer.
- Hotkeys (e.g. ⌘D for deploy) — defer to user keybindings file.
