# Feature: Contract interaction

## Status

**Shipped (UI):** the `ContractsPanel` lists a project's deployed contracts (from deploy history),
resolves the selected contract's ABI from its compiled artifact, and renders ABI-driven **Read** and
**Write** sections. Reads run free against the deploy's network; zero-arg reads auto-display. Writes
`simulateContract` first (so reverts surface before gas), sign with the most recent burner wallet, wait
for the receipt, and link the tx on the explorer. Backed by `monad.contract.{functions,read,write}` RPCs
and `monad-core/interact.ts`.

**Deferred:** the **Events** subscribe section, the explicit "Use deployed address" picker (the deployed
list serves this for now), and the `monad_call` / `monad_read` / `monad_estimate_gas` **MCP tools** (Phase
5 agent surface).

## Why

After deploy, the user (and the AI) need to call functions and read state. Doing this without UI means copy-pasting calldata into a browser explorer or writing forge scripts. We render an ABI-driven panel and expose MCP tools.

## ContractFunctionForm UX

Given a deployed contract:

- Section: **Read** (view/pure functions).
  - Auto-displays current return values for zero-arg reads.
  - Manual "Call" button for reads with args.
- Section: **Write** (state-changing).
  - Form per function, "Send" button, value field if `payable`.
  - On send: permission card → tx → streaming status.
- Section: **Events** (subscriptions).
  - Toggle subscribe; new events stream into the panel with decoded args.

Each section uses `AbiArgInput` for args (same component as constructor form, see [deploy.md](./deploy.md)).

## Simulation

Before sending a write, viem `simulateContract` runs. Catches reverts (with decoded reason when possible) before paying gas. Banner: "Simulation failed: <reason>. Send anyway? [No / Yes]."

## MCP tools

- `monad_call(address, abi, fn, args, value?)` → tx hash + receipt.
- `monad_read(address, abi, fn, args)` → return value (JSON-stringified).
- `monad_estimate_gas(address, abi, fn, args, value?)` → gas units + estimated cost in wei.

Same permission semantics as `monad_deploy`.

## Watching events

`monad_watch_event(address, abi, eventName)` is a Phase 7 follow-up — not in 0.05. UI subscribe is in scope; an MCP-streaming tool is not (Effect Streams over MCP needs more design).

## Address picker

Across forms, an "Use deployed address" picker lists addresses from the project's deploy history for that network. Removes copy-paste.

## Out of scope

- Cross-contract call composition (multicall UI) — defer.
- Time-travel state inspection on local devnet — defer (anvil supports it, no UI surface yet).
