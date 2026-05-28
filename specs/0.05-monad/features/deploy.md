# Feature: Deploy

## Why

One-click deploy is the marquee feature. It must work for the AI agent (no UI) and for the user (UI), against any of the three networks (local / testnet / mainnet) with the right permission card behavior.

## Deploy flow

1. **Compile** (auto, via [contracts.md](./contracts.md)). Abort with @-mentioned errors on failure.
2. **Resolve constructor args**:
   - From UI: rendered form, one input per arg, type-aware (`uint256`, `address`, `string`, `bytes`, tuple, array).
   - From AI/MCP: provided as a JSON array.
3. **Resolve network**: active session network unless overridden.
4. **Permission card**:
   - Local: auto-allow (unless user disabled).
   - Testnet: ask.
   - Mainnet: always-confirm modal (decoded args, value, estimated gas).
5. **Encode + sign + send**:
   - viem `deployContract` against the active wallet.
   - tx hash returned immediately.
6. **Wait for receipt** (streamed):
   - "Pending" → "Mined" → "Confirmed" (1 confirmation default; configurable).
7. **On success**:
   - Persist row in `monad_deploys`.
   - Trigger codegen ([abi-autowire.md](./abi-autowire.md)).
   - Emit toast + add entry to `DeployHistoryList`.

## Constructor arg form

`AbiArgInput` component drives the UI for each ABI input type.

- `uint*`, `int*` → numeric input with bigint validation.
- `address` → text input with checksum validation + "Use my wallet" / "Use other deployed address" buttons.
- `bytes*` → hex input with length check.
- `string` → text.
- `bool` → toggle.
- `<T>[]` → repeating list of `AbiArgInput`.
- `tuple` → nested form.

Pre-fill from the last successful deploy if args were captured.

## Deploy history

`monad_deploys` row per deploy:

```
projectId, network, contract, address, txHash, blockNumber,
deployerAddress, constructorArgs (json), gasUsed, deployedAt
```

History list is per-project, sortable, filterable by network. Each row has: open in explorer, copy address, "Use as constructor arg in next deploy", redeploy.

## AI / MCP integration

`monad_deploy` MCP tool. Signature in [ai-monad-tools.md](./ai-monad-tools.md). Same permission flow as UI deploys.

## Failure handling

- **Compile fails** → no deploy attempted; errors surfaced.
- **Insufficient funds** → toast with "Get testnet funds" button (testnet) or "Top up" link (mainnet).
- **Nonce mismatch** → auto-retry once after refetching nonce.
- **Reverted** → show revert reason if decodeable.
- **WC peer disconnected mid-deploy** → tx left as pending in history; user reconnects and can either resubmit (new tx) or just wait.

## Out of scope

- CREATE2 with custom salt — defer (use `forge create --create2` from terminal).
- Proxy patterns (UUPS, Transparent) — defer; users can write their own deploy script and we'll honor it.
- Constructor library linking via UI — falls back to terminal `forge` for linked libs.
