# ADR 0005 — Real wallet bridge: WalletConnect vs. injected (browser extension)

## Status

Accepted. WalletConnect v2.

## Context

For testnet/mainnet use, users want their existing wallet (MetaMask, Rainbow, Trust, etc.). Options:

1. **WalletConnect v2** — QR-pair from desktop to a wallet app (mobile or desktop).
2. **Browser extension injection** — requires a Chromium frame with MetaMask installed. Hacky from Electron.
3. **In-app extension support** — embed `chrome-extension://...` and require the user to install MetaMask into our Electron Chromium. Awful UX.

## Decision

WalletConnect v2 as the primary "real wallet" bridge. No injected/extension support in 0.05.

## Why

- **No installation friction.** Most users have MetaMask Mobile (or Rainbow / Trust / Phantom) already.
- **Cross-platform.** WC works the same desktop → mobile and desktop → desktop wallet.
- **Standard.** Most modern wallets ship WC support; Monad ecosystem assumes WC.
- **Avoids Electron-extension hell.** Embedding browser extensions into Electron is technically feasible but brittle.
- **Security boundary stays clean.** WC keeps the private key on the user's wallet device; we only see signatures.

## Trade-offs accepted

- First-time connection is a QR scan. Slightly slower than "click MetaMask icon." Acceptable.
- WC sessions can expire; we surface reconnect prompts.
- No support for wallets that exist only as browser extensions and don't ship WC (vanishing niche, but exists).

## Future

- If demand for desktop browser-extension wallets surfaces, consider an "injected mode" via embedded Chromium with an explicit extension install step. Phase 7+.
- Hardware wallet support (Ledger / Trezor) is its own ADR — both have WC-compatible companion apps now, so WC may be the bridge there too.
