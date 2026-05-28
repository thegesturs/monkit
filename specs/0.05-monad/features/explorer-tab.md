# Feature: Explorer tab

## Why

When something goes wrong on-chain — and it will — the user needs a tx history and decoded logs without bouncing to a browser tab. The agent also benefits: it can read its own tx history to debug.

## What it shows

Right-pane "Explorer" tab, scoped to the active project:

- **Tx list** (deploys + writes) sorted newest first.
  - Per row: network, contract or fn name (decoded), from, to, value, gas, status, time.
  - Click → detail panel.
- **Detail panel**:
  - Raw + decoded calldata.
  - Decoded event logs (against the project's known ABIs).
  - Status + receipt fields.
  - Link-out to the public Monad explorer for testnet/mainnet txs.
- **Search**: filter by tx hash, contract, fn name, from/to.
- **Network filter**: dropdown.

## Where data comes from

- Project-tracked txs: from `monad_deploys` + a new `monad_txs` table populated by every `monad_call` / `monad_publish` etc.
- Decoding: against ABIs from the deploy history.
- We do **not** crawl the chain. If the user wants someone else's tx, they paste a tx hash and we fetch + decode it on demand.

## Data flow

```
write/deploy succeeds
  → monad_txs row inserted
  → renderer subscribes to insert events via @effect/rpc Stream
  → Explorer list updates live
```

## Decode quality

- Function call: lookup against project ABIs; if no match, show raw calldata + selector.
- Log decode: same lookup; unknown logs render as raw topics + data.
- Errors decode: try project ABIs, then the standard `Error(string)` / `Panic(uint256)` ABIs from viem.

## MCP tool

`monad_get_tx(txHash, network)` → decoded tx + receipt. Used by AI agents to debug their own deploys.

## Out of scope

- Indexing all contracts on a network — out of scope; that's a subgraph product.
- Token balance histories per address — Phase 7.
- Mempool view — defer.
