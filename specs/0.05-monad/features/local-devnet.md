# Feature: Local devnet

## Why

Vibe coding needs instant feedback. Block times on Monad testnet are fast, but local is faster and free. Auto-spawn a local devnet so the user never has to think about it.

## Implementation

### Choice: anvil (Foundry's local node)

Default to `anvil` with Monad chain id. Reasons in [decisions/0001-anvil-vs-monad-node.md](../decisions/0001-anvil-vs-monad-node.md). When Monad ships a first-party devnet binary, we swap by changing one constant.

### Lifecycle

```
app start
  └─ no-op (devnet lazy)
project enters Monad mode
  └─ ensureDevnet():
       - check forge/anvil installed → banner if missing
       - pick free port in 9000..9020
       - spawn `anvil --chain-id 41454 --port <port> --block-time 1`
       - stream logs to a hidden terminal pane (available via right-pane "Devnet logs" tab)
       - wait for "Listening on" line, then mark ready
session active network = local
  └─ all RPC calls hit http://127.0.0.1:<port>
app quit / project closed
  └─ SIGTERM anvil; SIGKILL after 5s grace
```

### Reuse: PTY infrastructure

Uses the existing PTY service (same one powering terminal tabs). No new process management. Logs piped through the same xterm-ready stream.

### Recovery

- **Port collision** → retry with next port in range; if all 20 fail, show error with manual port input.
- **anvil crash** → auto-restart up to 3 times in 60s; banner if it keeps crashing.
- **Foundry uninstalled mid-session** → status turns red, banner offers re-install.

### Pre-funding burners

On anvil startup, the active burner address is funded via `anvil_setBalance` to `10000 ETH` so vibe coding works immediately. Done in `devnet.ts` after the ready signal.

### Forking testnet locally (Phase 7 follow-up)

`anvil --fork-url <testnet-rpc>` lets users debug against testnet state locally. Designed for, not shipped in 0.05.

## Settings

- `local.autoSpawn`: boolean (default true)
- `local.portRange`: [9000, 9020]
- `local.chainId`: integer (default 41454)
- `local.blockTime`: integer seconds (default 1)
- `local.preFundEth`: string (default "10000")
