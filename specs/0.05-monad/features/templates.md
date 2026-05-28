# Feature: Starter templates

## Why

Vibe coding starts from a working baseline, not an empty directory. Templates teach the AI the project shape and give the user a working dApp in <10s of scaffolding.

## Templates shipped

### `starter-foundry-vite` (default)

```
my-app/
  contracts/
    Counter.sol
    WAGMI.sol               # ERC20 example
    MyNFT.sol               # ERC721 example
  script/                   # forge scripts; not required, illustrative
  test/
    Counter.t.sol
  foundry.toml
  remappings.txt
  monad.config.json
  frontend/
    src/
      contracts/            # codegen target
      App.tsx               # uses generated hooks
      main.tsx
      wagmi-config.ts       # wagmi v2 config with Monad chains
    package.json            # vite, react, wagmi, viem
    vite.config.ts
    index.html
  package.json              # bun workspaces root
  AGENTS.md                 # AI instructions, see below
  README.md
```

### `starter-foundry-next`

Same contracts and `monad.config.json`, frontend swapped for Next.js with `output: "export"` for IPFS-publishable static export.

## AGENTS.md (template-level AI instructions)

Sits at the project root. Read by all bundled agents at session start. Contains:

- "This is a Monad dApp project."
- "Contracts live in `contracts/`. Frontend in `frontend/`."
- "Use `monad_deploy` to deploy. Use `monad_call` / `monad_read` to interact. Never copy-paste an address — `frontend/src/contracts/addresses.ts` is auto-generated on deploy."
- "Prefer Foundry idioms (forge build, forge test). The dev environment runs `anvil` automatically."
- "wagmi v2 + viem are the frontend libs. Generated hooks in `frontend/src/contracts/hooks.ts`."
- Example prompts the user might use.

This is how the agent "knows about Monad" without hardcoding into the agent itself.

## Bootstrap UX

- New session → "Start from template" → pick template → name → directory.
- Scaffolding copies the template (uses existing project-bootstrap path) and runs `bun install` + `forge install foundry-rs/forge-std` in the background terminal pane.
- Monad mode auto-enabled.
- Devnet auto-spawns.
- Initial deploy of Counter happens automatically (optional, behind a checkbox).

## Customization

Templates are vanilla files. No magic. The user can edit anything. We don't keep a "template manifest" tracking which files are template-owned — once scaffolded, the project is the user's.

## Out of scope

- Template marketplace / community templates — defer.
- Templates for other chains — Monad-only.
- React Native templates — defer.
