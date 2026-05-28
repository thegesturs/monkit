# Feature: Monad mode (project-level toggle)

## Why

We extend, not pivot. A project is in Monad mode or it isn't. Non-Monad projects must stay identical to today — no new tabs, no new commands, zero visual change. Monad mode is opt-in per project.

## UX

- Project settings page gets a **Monad mode** toggle (off by default).
- When toggled on:
  - Right pane shows the **Monad tab group** (Wallet, Contracts, Deploy, Explorer).
  - Composer enables Monad slash commands.
  - Agent driver loads the Monad MCP tools.
  - Status bar shows the active network + block height.
- When toggled off:
  - Tab group hides, slash commands unregister, MCP tools dropped from the agent's tool list.
  - Stored wallets / deploys remain (re-enable shows them again).

## Detection / auto-suggest

On project open, if the app detects any of: `foundry.toml`, `monad.config.json`, a `contracts/` directory with `.sol` files, or a frontend with wagmi in `package.json` — a one-time banner offers "Enable Monad mode for this project."

## Persistence

```sql
ALTER TABLE projects ADD COLUMN monad_mode BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE projects ADD COLUMN monad_config_path TEXT;
```

`monad_config_path` defaults to `<projectRoot>/monad.config.json` if not set.

## monad.config.json

Created on first deploy if absent. Schema:

```json
{
  "version": 1,
  "frontendDir": "frontend",
  "contractsDir": "contracts",
  "outDir": "out",
  "networks": {
    "default": "local"
  },
  "contracts": [
    { "name": "Counter", "src": "contracts/Counter.sol" }
  ]
}
```

The file is the source of truth for codegen paths. Edited by the deploy flow; safe for the user to edit by hand.

## Out of scope

- Multi-project workspaces with shared Monad config — defer.
- Auto-detection of Hardhat layouts — only Foundry in 0.05.
