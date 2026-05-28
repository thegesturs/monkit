# Vision

## The one-paragraph pitch

Memoize Alpha for Monad is a desktop app where you describe what you want to build, the AI writes the Solidity and the frontend, and one click deploys it to a real Monad chain — with a wallet, a faucet, a tx explorer, and a shareable IPFS URL all in the same window. No browser tabs. No `npx hardhat init`. No copying ABIs by hand. No Etherscan trips.

## What "good" looks like — three scenes

### Scene 1: First contract, fresh machine

1. User opens the app, picks "New Monad project" → "Counter starter."
2. Template scaffolds in ~8 seconds (Foundry contracts + Vite frontend).
3. Local devnet auto-spawns in background. Block height ticks in the status bar.
4. Burner wallet auto-generated, address shown, 0 ETH balance on local (anvil pre-funds it).
5. User clicks **Deploy** on `Counter.sol`. In ~2 seconds: tx hash + address appear, TS bindings auto-write to `frontend/src/contracts/`, frontend hot-reloads.
6. User clicks `increment()` in the Contracts panel. Tx fires, count updates.

**Total time: under 60 seconds from app launch.**

### Scene 2: Vibe-coding a feature

1. User: "Add an ERC-20 token to this project called WAGMI, mint 1000 to my burner, then call `balanceOf` to verify."
2. Claude reads the project, edits `WAGMI.sol`, edits the frontend.
3. Claude calls `monad_deploy` (MCP tool). Permission card flashes: auto-approve on local.
4. Claude calls `monad_call(mint, 1000)`. Permission card flashes: auto-approve on local.
5. Claude calls `monad_read(balanceOf, <burner>)`. Returns `1000`.
6. Claude reports: "Done. Token deployed at 0xabc…, 1000 WAGMI minted to your burner."

**Zero clicks from the user after the initial prompt.**

### Scene 3: Going to testnet

1. User flips the network switcher from **Local** → **Testnet**.
2. Banner: "You're on Monad testnet. Wallet balance: 0 ETH. [Get testnet funds]"
3. User clicks faucet. Tx fires. Balance updates to 1 ETH in ~10 seconds.
4. User clicks **Redeploy to Testnet**. Permission card: confirm (because it's testnet, not local). User confirms.
5. Contract redeployed, addresses file updated with both `local` and `testnet` entries.
6. User clicks **Publish dApp**. Vite builds, IPFS upload, QR code appears.
7. Phone scans QR, opens dApp, connects MetaMask Mobile via WalletConnect, calls `increment()`.

**Total time from open-app to phone-uses-it: under 5 minutes.**

## Design principles

### 1. The AI agent is a first-class user
Every UI action has an MCP tool equivalent. Anything the user can click, the agent can do — same permission system, same audit log. The agent is not a chatbot bolted on; it's a peer.

### 2. Local is instant; testnet is one click away
Default everything to the auto-spawned local devnet. Testnet is a deliberate switch, not the default — so vibe coding never accidentally burns testnet faucets or waits on real block times.

### 3. Mainnet is always-confirm
No "remember this choice" for mainnet writes. Every single state-changing tx on mainnet goes through a confirm modal with the decoded function name, args, and value. Cooldown between mainnet sends.

### 4. The frontend is part of the deploy
On every deploy, TS bindings auto-write. No "now go update your frontend with the new address." This is the difference between "Solidity IDE with a browser tab" and "dApp dev environment."

### 5. Templates are how vibe coding starts
The starter templates are the AI's reference. The agent reads them, mimics them, and the user gets opinionated structure for free. Customization happens after the user can build something that works.

### 6. Nothing leaves the machine by default
Burner keys: keychain. RPC: configurable, but local by default. Code: local. The only network calls are user-initiated: RPC to public Monad nodes, IPFS publish, optional WalletConnect.

## Anti-goals

- We are not building a general-purpose smart contract IDE. **Monad-first.** Other chains are not a goal.
- We are not building a contract auditor / fuzzer / formal verifier. Defer to Foundry's tools (forge test, forge fuzz) — surface their output, don't replicate.
- We are not building an indexing / subgraph product. The user's dApp talks to RPC directly via wagmi. No "Memoize-the-graph."
- We are not building a multi-sig / Safe / DAO governance UI. Single EOA flows only in this MVP.
- We are not shipping a hosted cloud version. Desktop-first.

## Success metrics

- **Time-to-first-deployed-contract on a fresh machine**: < 2 min (excluding dependency install).
- **Time-to-prompted-feature-deployed-and-callable**: < 60s once dependencies are warm.
- **Number of user clicks for the happy-path Scene 1**: ≤ 4.
- **Number of distinct windows / browser tabs needed**: 1 (the app itself).
- **Onboarding completion rate** to first deploy: target ≥ 70% (measured via opt-in telemetry).

## Why this can win

Remix is browser-based and not AI-native. Hardhat / Foundry are CLI-first and not vibe-coder-friendly. Cursor + a terminal is the status quo but requires the user to wire wallet, ABI, frontend by hand. Memoize Alpha already has the agent host, the file editor, the terminal, the MCP plumbing. Bolting Monad-native deploy + wallet + explorer onto it gives one experience that no other tool has assembled.
