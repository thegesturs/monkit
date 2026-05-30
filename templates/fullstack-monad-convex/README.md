# Full-stack Monad dApp

A starter for building on **Monad**: a Solidity contract, a React frontend, and a Convex backend — wired
together. Built to run inside the app (deploy, interact, and publish without a terminal), but it's a plain
repo you fully own.

## Stack

Foundry · Vite + React 19 · wagmi v2 + viem · Convex (DB + auth) · Tailwind v4 + shadcn/ui (dark theme) ·
Biome (lint + format).

## Layout

```
contracts/                 Foundry — Solidity contracts + tests
  src/Counter.sol
  test/Counter.t.sol
frontend/
  src/
    components/
      ui/                  shadcn/ui primitives (button, card, badge)
      header.tsx           wallet connect
      counter-card.tsx     on-chain counter (wagmi)
      leaderboard.tsx      off-chain leaderboard (Convex)
    pages/
      index.tsx            home
      not-found.tsx        404
    lib/
      wagmi-config.ts      Monad chains (local + testnet)
      convex-client.ts     Convex client (provisioned on setup)
      utils.ts             cn() + helpers
    contracts/             @generated bindings (addresses + ABIs) — written on deploy
    app.tsx                routes
    main.tsx               providers (wagmi, react-query, convex, router)
    index.css              Tailwind v4 + theme tokens
  convex/                  Convex backend
    schema.ts              off-chain tables (leaderboard, etc.)
    counter.ts             queries / mutations
    auth.config.ts         Convex Auth (wired further in Phase 7)
  components.json          shadcn config
  biome.json               lint + format
monad.config.json          contracts + frontend + network config
AGENTS.md                  how the AI agent works in this project
```

## What goes where

On-chain (`contracts/`) is for value, ownership, and trust-critical logic. Everything else — accounts,
profiles, leaderboards, scores — lives off-chain in `frontend/convex/`. The on-chain count lives in
`Counter.sol`; the leaderboard lives in Convex.

## Running it yourself (outside the app)

```bash
# contracts
cd contracts && forge test && forge build

# frontend
cd frontend && bun install && bun run dev
# (Convex) bun run convex   — starts the Convex backend, sets VITE_CONVEX_URL
# lint / format: bun run lint   |   bun run format
```

Deploy a contract from the app's Deploy panel (or ask the agent to `monad_deploy`); the frontend bindings
under `frontend/src/contracts/` update automatically.
