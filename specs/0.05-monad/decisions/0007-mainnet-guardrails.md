# ADR 0007 — Mainnet guardrails

## Status

Accepted. Always-confirm modal + cooldown + opt-in unhide.

## Context

Mainnet writes cost real money and are irreversible. We must make it nearly impossible to:
- Send a mainnet tx by mistake.
- Have an AI agent send a mainnet tx without explicit human approval.
- Pile multiple mainnet txs back-to-back without realizing it.

## Decision

Three-layer guardrail for every mainnet write:

### 1. Mainnet is hidden by default
- `NetworkSwitcher` shows only Local and Testnet until the user enables mainnet in Settings.
- Enabling mainnet shows a one-time disclaimer with a "Yes I understand" confirmation.

### 2. Always-confirm modal
- Every mainnet write (`monad.write`, `monad.deploy`, `monad.sign_message`, `monad.publish`) shows a modal.
- The session-level "auto-approve all" toggle does **not** apply to mainnet.
- The modal shows: contract + function + decoded args + value + estimated gas + active wallet address.
- Confirm button is disabled for 1 second after the modal opens (anti-doubleclick).

### 3. Cooldown
- After a mainnet write, the next mainnet write for the same wallet is locked for 5 seconds.
- Cooldown countdown displayed on the Send button.
- Cooldown applies to UI actions, slash commands, and MCP tool calls equally.

## Why

- **Reversibility is zero.** The cost of a wrong tap is higher than the cost of an extra click.
- **Agents can be wrong.** An LLM that misreads a prompt and sends mainnet tx is a real failure mode. Always-confirm closes the gap.
- **Cooldown defeats sequential mistakes.** Common pattern: confirm one tx, immediately confirm a second thinking it's the same. The 5-second pause breaks autopilot.
- **Hidden mainnet defeats "wrong network" mistakes.** User explicitly chooses to enable it.

## Trade-offs accepted

- Slightly slower mainnet flow. Acceptable — fast mainnet is exactly the wrong optimization.
- Power users may be annoyed by the cooldown. Acceptable — they can ship-then-tweet.

## Logging

Mainnet permission decisions are written to `<projectRoot>/monad_audit.log` (plaintext, append-only):
```
2026-05-28T14:32:01Z  CONFIRMED  monad.write  Counter@0xabc.increment()  wallet=0xdef…  tx=0x123…
```

This file is **outside** SQLite so it survives DB resets and is grep-friendly.

## Future

- Optional value cap per session ("never send more than 0.1 ETH without re-typing the amount").
- Time-of-day or weekday restrictions.
- Hardware-key gating for mainnet (Touch ID via passkey + secure enclave).
