# ADR 0004 — Burner private key storage

## Status

Accepted. macOS Keychain via existing credentials layer.

## Context

Burner wallets need a private key stored locally. Candidates:

1. **macOS Keychain** (via existing credentials layer used for API keys).
2. **Encrypted SQLite blob** with a user-provided password.
3. **Plaintext file** in app data dir (with FS permissions).
4. **OS-level secure enclave** (Touch ID / passkey-gated).

## Decision

macOS Keychain via the existing credentials layer at `apps/desktop/src/credentials/`. Same module that already holds AI provider API keys. Burner key entries use the namespace `monad.wallet.<walletId>.privateKey`.

## Why

- **Reuse path is clean.** Keychain access is already wired, audited, and uses the right macOS APIs.
- **OS-level security model.** Encrypted at rest, sandboxed to the signed app bundle, optional Touch ID gate.
- **No new password to remember.** A separate password (option 2) is a UX wall that pushes vibe coders to use insecure paths.
- **No plaintext on disk.** Rules out option 3.
- **Secure enclave (option 4)** is overkill for *burner* keys whose purpose is fast testing. Out of scope for 0.05 — could layer on for "promote burner to trusted wallet" flow later.

## Trade-offs accepted

- Keychain access blocks on first use (user permission prompt). One-time cost.
- macOS only. App is macOS only already.
- Keychain export needs an "always-confirm" UX since extraction is a leak vector.

## Operational

- Keys never leave `apps/server`. Renderer only sees addresses + signatures.
- IPC for signing: renderer requests "sign tx X with wallet Y" → server fetches key from keychain → signs → returns signature. Key not serialized over IPC.
- Wallet deletion: removes keychain entry + SQLite row. Tombstone optional (not in 0.05).
