# Phase 6 — Explorer + frontend publish + templates

**Goal.** Users can see tx history with decoded logs, publish their frontend to IPFS, share via QR. Starter templates ship the polished happy path end-to-end.

## Scope

- `ExplorerPanel` UI + `monad_txs` table + decoders.
- `monad-core/publish.ts` (vite/next build + web3.storage upload).
- Optional Vercel CLI integration.
- `monad_publish` and `monad_get_tx` MCP tools.
- Onboarding wizard finalized (per [onboarding.md](../features/onboarding.md)).
- Templates (`starter-foundry-vite`, `starter-foundry-next`) shipped under `packages/monad-templates`.

## Out of scope

- ENS contenthash publish (Phase 7).
- Contract verification on the public Monad explorer (Phase 7).
- Time-travel state inspection on local devnet (Phase 7).

## Critical files

- `apps/server/src/monad/layer.ts` — extend with `Explorer`, `Publish` services.
- `packages/monad-core/src/` — add `explorer.ts`, `publish.ts`.
- `packages/monad-ui/src/ExplorerPanel.tsx`, `TxRow.tsx`.
- `packages/monad-templates/starter-*` — new package with template files.
- `apps/desktop/src/menu.ts` or equivalent project-bootstrap path — wire "New from Monad template" entry.

## Implementation steps

1. **Tx tracking table.**
   - New `monad_txs` table (txHash PK, projectId, network, contract?, fn?, decodedArgs json, fromAddress, toAddress?, value, gasUsed, status, blockNumber, minedAt).
   - All deploy + call paths insert a row pre-send (status: pending) and update post-receipt.

2. **`monad-core/explorer.ts`.**
   - `listProjectTxs(projectId, network?)`.
   - `decodeTx(txHash, network)`: fetch via viem if not in DB; decode against project ABIs.
   - `decodeLogs(receipt, knownAbis)`.

3. **`ExplorerPanel`.**
   - Tx list with filters (network, contract, fn).
   - Detail panel: decoded calldata, logs, status, gas, link-out to public Monad explorer for testnet/mainnet.
   - Search by hash / contract / fn.

4. **`monad-core/publish.ts`.**
   - Detect package manager + framework.
   - Run `<pm> run build`.
   - For IPFS: tarball `dist/` (or framework's static out) → upload to web3.storage → return CID + gateway URL.
   - For Vercel: shell `vercel deploy --prod`, return URL.

5. **Publish UI.**
   - "Publish" button in Deploy panel.
   - Modal: network (for `addresses.ts` final value), target (IPFS/Vercel).
   - Build runs in terminal pane (streaming output).
   - Success: QR code + URL + copy/open buttons.

6. **Web3.storage token UX.**
   - First publish: prompt for token; store in keychain.
   - Token management: Settings → Monad → Hosting.

7. **MCP tools.**
   - `monad_get_tx(txHash, network?)` returns decoded tx + receipt.
   - `monad_publish(network, target?)` builds + uploads; permission card always required.

8. **Onboarding wizard.**
   - Finalize the new Monad section per [onboarding.md](../features/onboarding.md).
   - Reachable from Settings → Monad → "Run onboarding."

9. **Templates.**
   - `packages/monad-templates/starter-foundry-vite/` — Counter + WAGMI (ERC20) + MyNFT (ERC721), wagmi v2 frontend, working UI examples that use the codegen'd hooks.
   - `packages/monad-templates/starter-foundry-next/` — same but with Next.js export mode.
   - `AGENTS.md` in each template explaining Monad mode + the tools available to the AI.

10. **Bootstrap UX.**
    - "New Monad project" entry in the existing project-creation flow.
    - Picks template → name → directory → scaffolding → install deps in PTY → optional auto-deploy Counter.

## Verification (full demo)

1. Fresh machine, fresh app profile.
2. Onboarding wizard appears on first Monad mode toggle. Walk through: toolchain check → burner generated → faucet → first project.
3. "New Monad project" → `starter-foundry-vite` → name → scaffold → install → devnet auto-spawns → optional auto-deploy of Counter.
4. Chat: "Add a feature where each `increment()` mints 1 WAGMI to the caller." Claude edits Solidity, deploys, updates frontend.
5. Switch network → Testnet. Faucet → fund. Redeploy.
6. Click "Publish" → IPFS upload completes → QR code shown.
7. Scan QR on phone → opens dApp in mobile browser → connect MetaMask Mobile via WalletConnect → click increment → tx fires on Monad testnet.
8. Open ExplorerPanel → see the testnet tx, decoded `increment()`, decoded `Transfer(WAGMI)` log.

Total wall-clock from fresh app to dApp-on-phone: target **under 5 minutes** (excluding cold dep installs).

## PR scope

Likely two PRs:
- `feat(monad): explorer + tx tracking + publish (#NNN)` (~2000 LOC)
- `feat(monad): templates + onboarding wizard (#NNN)` (~2000 LOC)

Splitting reduces review surface and isolates the template files from runtime code.
