# Feature: Wallet

## Why

Vibe coders need a working wallet in <5 seconds with no extension install. Pros need to connect their real wallet for testnet/mainnet. Both paths first-class.

## Modes

### Burner wallet (default for local + testnet)
- Generated via viem `generatePrivateKey()` on first use.
- Private key stored in macOS Keychain via the existing credentials layer (key: `monad.wallet.<id>.privateKey`).
- Metadata (address, label, createdAt) in `monad_wallets` SQLite table.
- Multiple burners per project allowed; one is "active" at a time.
- Anvil pre-funds the burner with 10000 ETH on local devnet via `--mnemonic` derivation OR explicit `anvil_setBalance`.

### WalletConnect v2 (for testnet/mainnet with real wallets)
- User clicks "Connect wallet" → QR code shown → scan with MetaMask / Rainbow / etc.
- WC session secret in keychain (`monad.walletconnect.<sessionId>`).
- Server holds the WC client; renderer never touches the secret.
- Disconnect / reconnect flows surfaced in `WalletPanel`.

### Import private key
- Settings → Wallets → Import. User pastes a hex key. Key stored in keychain. Address derived and stored.
- Hard-warn: "We recommend using WalletConnect for real funds. Imported keys live on this machine."

## Wallet panel UX

- Address (truncated, click to copy).
- Network + balance (live, updates on new block).
- Label (editable).
- Actions: Switch wallet, Add new burner, Connect WalletConnect, Import key, Export key (always-confirm modal).
- Faucet button (visible only on testnet, hits public Monad faucet endpoint).

## Signing flow

1. Requestor (UI button or AI tool call) calls `signTx` / `signMessage` RPC.
2. Server fetches private key from keychain (or relays to WC peer).
3. Permission card appears in chat timeline.
   - Local: auto-allow per session (configurable).
   - Testnet: ask, with "remember for this session" option.
   - Mainnet: always-confirm modal with decoded function + value. No "remember" option.
4. Signature returned to requestor.

Private keys never leave `apps/server`. The renderer only ever sees signatures and addresses.

## Multi-wallet support

A project can have N wallets. `Active wallet` per session (not per project — so an agent in workspace A and the user in workspace B can use different burners against the same project).

## Out of scope

- Hardware wallets (Phase 7+).
- HD wallet derivation paths (single key per burner only).
- Multi-sig (Phase 7+).
- Sign-in-with-Ethereum / SIWE flows.

## Related decisions

- [0004-keychain-burner-storage.md](../decisions/0004-keychain-burner-storage.md)
- [0005-walletconnect-vs-injected.md](../decisions/0005-walletconnect-vs-injected.md)
- [0007-mainnet-guardrails.md](../decisions/0007-mainnet-guardrails.md)
