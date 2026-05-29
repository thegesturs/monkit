# 0.05-monad — Monad-native dev environment

The easiest way for vibe coders to build, test, and ship dApps on **Monad**, layered on top of Memoize Alpha.

## What this is

A first-class **Monad mode** inside the existing Memoize Alpha desktop app. It does not replace the general AI coding agent — it sits next to it. When a project has Monad mode enabled, the user gets:

- A managed local Monad-compatible devnet (auto-spawned anvil with Monad chain id)
- A burner wallet (keychain-stored) + WalletConnect bridge for real wallets
- One-click compile + deploy of Foundry contracts to local / testnet / mainnet
- Auto-generated TypeScript bindings (addresses, ABIs, wagmi v2 hooks) written into the frontend on deploy
- An ABI-driven contract interaction panel
- A built-in tx/log explorer
- AI agents (Claude, Codex, Grok, Gemini, Cursor, OpenCode) with MCP tools for `monad_deploy`, `monad_call`, `monad_read`, `monad_balance`, `monad_sign_message`, `monad_publish`
- Composer slash commands: `/deploy`, `/call`, `/read`, `/switch-net`, `/wallet`
- A starter template (Foundry + Vite + wagmi v2) that the AI is pre-trained on

## Target user

The vibe coder who wants to:

> "Open the app → tell the AI what to build → see contracts and a frontend appear → click Deploy → see it work on Monad testnet → share an IPFS URL."

Zero Solidity setup, zero RPC config, zero ABI copy-paste. The agent and the tooling do that.

## North-star UX

Fresh machine. User installs the app. Time-to-deployed-dApp on Monad testnet: **under 2 minutes** for the happy path (excluding npm install + forge install on first run).

## Document map

- [vision.md](./vision.md) — north-star UX, design principles, what "good" looks like
- [architecture.md](./architecture.md) — package layout, service graph, security model
- [roadmap.md](./roadmap.md) — phased delivery, Phase 1 → Phase 6
- [features/](./features) — one file per feature, all designed up-front
- [decisions/](./decisions) — ADRs for the key choices (anvil vs. monad-node, viem vs. ethers, etc.)
- [phases/](./phases) — phase-by-phase execution checklists

## Status

**Spec phase (adapted for monkit fork).** 

**Important:** This repository (monkit) is a Monad-specialized fork of the parent Memoize Alpha project. Monad capabilities are **always on by default** — there is no "Monad mode" toggle or opt-in. Every project is treated as a Monad dApp project. The original 0.05-monad spec language about "toggling mode" and conditional UI has been adjusted accordingly during implementation (see Phase 1 PR).

Nothing implemented yet at the start of the fork. The parent codebase had zero blockchain code.

## Relationship to prior MVPs

- 0.01–0.04 built the general-purpose agent host (sessions, drivers, terminals, file editor, MCP code index).
- 0.05 reuses *all* of that: Effect runtime, permission policy, PTY infra, MCP server, slash command registry, keychain credentials, SQLite persistence.
- We don't fork. We extend. See [architecture.md](./architecture.md) for the reuse contract.
