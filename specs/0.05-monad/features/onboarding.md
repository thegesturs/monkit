# Feature: Onboarding wizard (Monad)

## Why

First-time vibe coders are intimidated by chains, wallets, RPC, gas. The wizard turns the first 60 seconds into a guided "you're now building on Monad" moment.

## Trigger

- First time the user enables Monad mode on any project, OR
- First time the user picks a Monad starter template, whichever happens first.

The existing onboarding wizard (`apps/renderer/src/components/onboarding/`) gets a new opt-in flow appended.

## Steps

### 1. "What is Monad?" (skippable, 1 screen)
- Short copy: "Monad is a fast EVM chain. You'll build Solidity contracts + a React frontend, deploy with one click, and ship."
- "Tell me more" link → embedded in-app webview to monad.xyz docs.

### 2. Toolchain check
- We probe: `forge --version`, `node --version`, optional `bun`, optional `vercel`.
- For each missing critical tool: one-click install via PTY.
  - Foundry: `curl -L https://foundry.paradigm.xyz | bash && foundryup` (in PTY, user watches).
  - Bun: `brew install oven-sh/bun/bun` if brew present, else download script.
- Skip-allowed; we'll re-prompt at first use.

### 3. Wallet setup
- "Create a burner wallet for testing" (default, one click).
  - Burner generated, address shown, "your private key is in your Mac Keychain."
- Or "Connect a real wallet" → WalletConnect QR.
- Or "Skip — I'll set up later."

### 4. Network choice
- "Default network for this project: Local (fastest) / Testnet (for real)."
- Local recommended for vibe coding; testnet for ready-to-share.

### 5. Faucet
- Only shown if testnet picked.
- One click → hit Monad testnet faucet for the active wallet.

### 6. First project
- Two big buttons:
  - "Try the Counter starter" → scaffolds `starter-foundry-vite`, deploys Counter automatically.
  - "Start blank" → exits the wizard, ready to chat.

## State

`monad_onboarded: boolean` in user settings. Set after the wizard completes or is dismissed. Re-runnable from Settings → Monad → "Run onboarding again."

## Localization

English only in 0.05. Strings extracted for future i18n.

## Out of scope

- Video walkthrough — defer.
- "Restore from backup" recovery flow — defer until we have a backup format.
- Multi-user / org onboarding — single-user desktop.
