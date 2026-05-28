# ADR 0003 — Smart contract toolchain: Foundry vs. Hardhat

## Status

Accepted. Foundry only in 0.05.

## Context

We need to compile Solidity and produce ABIs. Two ecosystems:

1. **Foundry** (`forge`, `cast`, `anvil`) — Rust-based, fast, EVM-native, Solidity-first tests.
2. **Hardhat** — Node.js-based, plugin ecosystem, TypeScript-first scripts.

## Decision

Support Foundry only in 0.05. The starter templates are Foundry. `monad-core/compile.ts` wraps `forge build`. Local devnet is `anvil` (Foundry).

## Why

- **Speed.** `forge build` is dramatically faster than `hardhat compile` for non-trivial projects. Vibe coding loops on compile time.
- **EVM-equivalence assumed.** Monad is EVM-equivalent; Foundry's Solidity-first model fits.
- **anvil is part of Foundry.** Picking Foundry gives us the local devnet "for free."
- **Ecosystem direction.** New EVM L1/L2 ecosystems (incl. Monad's published examples) skew Foundry.
- **One toolchain to teach the AI.** AGENTS.md template instructions are simpler with one stack.

## Trade-offs accepted

- Hardhat users have to install Foundry or wait for follow-up support. Not great for migrating projects.
- Foundry's TypeScript story is weaker than Hardhat's. But our codegen produces TS bindings for the frontend; we don't need TS in the contracts dir.

## Future (Phase 7+)

- Hardhat detection: if a project has `hardhat.config.{js,ts}`, suggest "Monad mode currently supports Foundry. [Convert to Foundry] / [Open issue]."
- Eventually: wrap Hardhat's compile output in the same `ContractArtifact` shape, switch behind a config flag.
