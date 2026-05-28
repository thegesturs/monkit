# Feature: AI Monad tools (MCP surface)

## Why

Every UI action has an MCP-tool peer. The agent is a first-class user. This means deploy/call/read/sign can all be driven from a chat prompt — and the audit log + permission system are identical to user clicks.

## Tools shipped

Registered in `apps/mcp-server/src/tools/monad.ts`. Same pattern as `code_search` (see [specs/0.04-MVP/features/code-index.md](../../0.04-MVP/features/code-index.md)).

| Tool | Purpose | Permission |
|---|---|---|
| `monad_get_network` | Get the active network's id, chainId, rpcUrl | none (read-only) |
| `monad_get_address` | Get the active wallet address | none |
| `monad_balance(address?)` | Balance of given address or active wallet | none |
| `monad_block_number` | Current block height on active network | none |
| `monad_read(address, abi, fn, args)` | Call a view/pure function | none |
| `monad_estimate_gas(...)` | Estimate gas for a write | none |
| `monad_call(address, abi, fn, args, value?)` | Send a state-changing tx | `monad.write` |
| `monad_deploy(contract, args, network?)` | Compile + deploy | `monad.deploy` |
| `monad_sign_message(message)` | Personal sign a message | `monad.sign_message` |
| `monad_get_tx(txHash, network?)` | Fetch + decode a tx | none |
| `monad_codegen` | Force regen of frontend bindings | none (filesystem write) |
| `monad_publish(network, target?)` | Build + publish frontend | `monad.publish` |
| `monad_switch_network(networkId)` | Change session active network | none (no chain effect) |
| `monad_request_faucet(address?)` | Hit testnet faucet | none (rate-limited by upstream) |
| `monad_wallet_new(label?)` | Create a new burner | none (local key gen) |
| `monad_wallet_list` | List wallets in project | none |
| `monad_wallet_switch(walletId)` | Change active wallet for session | none |

## Tool schemas

All inputs are Effect Schema (mirrors `code_search`). Schemas live in `packages/wire/src/monad.ts` so renderer RPC + MCP share types.

```ts
const MonadDeploy = S.Struct({
  contract: S.String,             // contract name as in artifact
  constructorArgs: S.Array(S.Unknown),
  network: S.optional(NetworkId), // defaults to session active
  value: S.optional(BigIntFromSelf),
  walletId: S.optional(WalletId),
})
```

## Discovery

The tools appear in every supported agent driver (Claude, Codex, Grok, Gemini, Cursor, OpenCode) automatically when the session's project has Monad mode enabled. When Monad mode is off, the tools are filtered out of the driver's tool list — agents in non-Monad projects can't accidentally deploy.

## Permission propagation

Every state-changing tool goes through `apps/server/src/policy.ts`. The permission card is the same component the existing tool calls (Bash, Edit, etc.) use. No new UI surface — same card, new kinds.

Mainnet writes bypass the session-level "auto-approve" — always-confirm modal. See [permissions.md](./permissions.md).

## Examples (prompts that just work)

- "Deploy Counter to local."
- "Mint 100 WAGMI to my burner."
- "What's my balance on testnet?"
- "Switch to testnet and redeploy everything."
- "Publish the frontend to IPFS, but only after deploying to testnet."

## Out of scope

- Subscribing to events from an MCP tool (streaming) — Phase 7.
- Multi-chain compose (deploy same contract to several networks in one call) — Phase 7.
- Time-travel state read on local devnet — Phase 7.
