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

**One general-purpose template. Keep it that way.** A template is a bare starter repo — the clean
baseline the agent builds *on top of* — not an app. We deliberately do **not** ship app-specific templates
(NFT mint, token launchpad, etc.); those are things the agent builds, not things we pre-bake.

| Template | What it is | Convex |
|---|---|---|
| **`fullstack-monad-convex`** (the only one) | Bare full-stack starter: a Foundry contract + Vite/React + wagmi/viem frontend (shadcn/ui, dark theme) + Convex backend (DB + auth), all wired for Monad. No demo features — just the canvas. | ✅ wired |

It must stay **bare**: shadcn primitives + Monad wiring + Convex wiring, ready to deploy, with a minimal
starter shell — no feature components, no demo screens. The agent fills in the actual app.

> Possible future addition (not now): a single `onchain-mini-app` general starter, *if* it proves to open
> many directions. Resist adding anything more specific than that. Fewer templates, more general.

## Structure (as built)

Files are **kebab-case**. The frontend is a bare shadcn/ui + Vite app; Convex is co-located in the
frontend package (the standard, reliable Vite + Convex layout). Tailwind v4 + Biome are pre-configured.

```
my-app/
  contracts/                  # Foundry
    src/Counter.sol           # one minimal example contract (generic, not app-specific)
    test/Counter.t.sol        # forge test runs pre-deploy
    foundry.toml
    remappings.txt
  frontend/
    src/
      components/
        ui/                   # shadcn/ui primitives (button, card) — bare
        header.tsx            # wallet connect
      pages/                  # index.tsx (starter shell) + not-found.tsx
      lib/                    # wagmi-config.ts (Monad chains), convex-client.ts, utils.ts (cn)
      contracts/              # @generated codegen target (addresses.ts, abis.ts) — written on deploy
      app.tsx                 # routes
      main.tsx                # providers: wagmi + react-query + convex + router
      index.css               # Tailwind v4 + theme tokens (dark)
    convex/                   # Convex backend
      schema.ts               # offchain tables (one example table — replace)
      auth.config.ts          # Convex Auth (deepened in Phase 7)
      _generated/api.ts       # anyApi stub so the app builds before provisioning (codegen overwrites)
    components.json           # shadcn config
    biome.json                # lint + format
    package.json              # vite, react, wagmi, viem, convex, shadcn deps
  monad.config.json           # networks, contracts, frontendDir
  package.json                # bun workspaces root
  AGENTS.md                   # AI instructions (below)
  README.md
```

The starter ships **no feature UI** — just the wiring and a minimal shell. The onchain piece stays minimal;
accounts, profiles, leaderboards, sessions live in Convex. See [convex-backend.md](./convex-backend.md) for
the on/offchain split and the in-app DB panel.

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
