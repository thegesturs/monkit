# ADR 0002 — Web3 library: viem vs. ethers

## Status

Accepted. viem everywhere.

## Context

We need a TypeScript Ethereum library inside `packages/monad-core` (server-side RPC, sign, contract calls) and in the frontend template (wagmi consumer).

Candidates:

1. **viem** — modern, tree-shakeable, type-safe, ABI-aware via TypeScript.
2. **ethers v6** — mature, larger surface, more legacy.

## Decision

Use viem for both server-side `monad-core` and the frontend template (paired with wagmi v2, which is built on viem).

## Why

- **Type safety from ABI**: viem can infer return types and arg types directly from `as const` ABI literals. This makes the codegen'd `hooks.ts` actually typed end-to-end.
- **wagmi v2 is built on viem.** Splitting libraries between server and frontend means duplicating ABI types and double-importing. One library, one source of truth.
- **Smaller bundle for the frontend.** viem is tree-shakeable; ethers is more monolithic.
- **Active development matches Monad ecosystem.** Monad docs themselves use viem in examples.
- **Effect compatibility.** viem is plain promises, easy to wrap in Effect. ethers has its own Provider/Signer abstractions that don't compose as well.

## Trade-offs accepted

- Slightly smaller community + less StackOverflow than ethers. Solvable: viem's docs are good; we ship working examples in templates.
- viem APIs have evolved through v2; we pin a version and upgrade deliberately.

## Future

- If a critical Monad feature requires an ethers-only ecosystem tool, we'd wrap that one feature in ethers but keep viem as the default. No mixed defaults.
