# ADR 0001 — Local node: anvil vs. official Monad devnet binary

## Status

Accepted. Default to `anvil`; design `monad-core/devnet.ts` to swap if/when Monad ships a first-party devnet.

## Context

Vibe coding requires a local node — instant block times, free gas, isolated state. Two candidate paths:

1. **anvil** (Foundry's Rust EVM) configured with the Monad chain id.
2. **Official Monad devnet binary** if/when published by the Monad team.

At spec time, Monad has not shipped a public single-binary devnet. anvil is the de-facto local EVM for the broader ecosystem.

## Decision

Default to `anvil --chain-id <monad>`. The `monad-core/devnet.ts` module exposes a `LocalNodeRuntime` interface; swapping in a Monad-native binary later is one impl change. Lifecycle (spawn / log / restart / kill) stays the same.

## Why

- **anvil is fast, well-tested, and ubiquitous.** Foundry users already have it.
- **anvil has the cheat codes vibe coders need**: `anvil_setBalance`, `anvil_impersonateAccount`, snapshot/revert. These don't exist on a vanilla L1 node.
- **Monad is EVM-equivalent**, so anvil's EVM semantics are correct for nearly all dev cases.
- **Swap path is cheap**: we abstract behind one interface; replacing the binary is < 50 lines.

## Trade-offs accepted

- anvil's mempool / consensus aren't real Monad. Local devnet won't reproduce Monad-specific block production timing or parallel execution. Acceptable: that's what testnet is for.
- If a contract relies on Monad-specific precompiles or non-EVM-standard behavior, it'll work on testnet but not local. We surface this in the wallet panel: "On Monad local (anvil). Behavior matches EVM; Monad-specific features test on testnet."

## Future

- If Monad ships a single-binary devnet with cheat codes, switch the default. Keep anvil as an option for the cheat code surface area.
- If Monad ships a devnet that requires multi-node setup or heavy resources, keep anvil; expose Monad devnet as opt-in.
