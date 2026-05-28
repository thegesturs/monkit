# Phase 3 — Local devnet + compile + deploy

**Goal.** From a Foundry project, one click compiles and deploys a contract to local or testnet. Deploy history persists.

## Scope

- Local devnet (anvil) auto-spawn and lifecycle.
- `forge build` integration; ABI extraction.
- Deploy flow with constructor arg form.
- Deploy history persistence + UI list.
- Permission cards for `monad.deploy` / `monad.write`.

## Out of scope

- Frontend codegen (Phase 4).
- MCP tools (Phase 5) — UI-only here.

## Critical files

- `apps/server/src/services/` — PTY infra to reuse for anvil + forge processes.
- `apps/server/src/monad/layer.ts` — extend with `Devnet`, `Compile`, `Deploy` services.
- `packages/monad-core/src/` — add `devnet.ts`, `compile.ts`, `deploy.ts`, `abi.ts`.
- `apps/renderer/src/components/right-pane.tsx` — wire Contracts and Deploy tabs.
- `apps/renderer/src/composer/` — file-mention pattern for surfacing compile errors.

## Implementation steps

1. **`monad-core/devnet.ts`.**
   - `ensureRunning(networkId="local")`: idempotent. Spawn anvil with chain id, port in 9000–9020, block-time 1.
   - Stream stdout to a dedicated "Devnet logs" terminal entry (uses existing terminal service).
   - Auto-restart on crash (max 3 in 60s). SIGTERM on app quit.
   - Pre-fund active burner via `anvil_setBalance` after ready.

2. **Foundry detection.**
   - `monad-core/compile.ts` shells `forge --version`.
   - Missing → renderer banner with one-click install (PTY runs `curl -L https://foundry.paradigm.xyz | bash && foundryup`).

3. **`monad-core/compile.ts`.**
   - `compileProject(projectPath)`: runs `forge build --json` in PTY, captures output.
   - Parses errors → `{ file, line, column, message, severity }`.
   - Sends errors to renderer as composer @-mention candidates (existing pattern).

4. **`monad-core/abi.ts`.**
   - Reads `out/<Contract>.sol/<Contract>.json`.
   - Returns `ContractArtifact` (see [contracts.md](../features/contracts.md)).
   - Classify functions read vs. write by `stateMutability`.

5. **`monad-core/deploy.ts`.**
   - `deploy(contract, args, networkId, walletId)`:
     - Resolve artifact, encode constructor args, get wallet, viem `deployContract`.
     - Return `{ txHash, address }` (address from receipt).
   - Insert row in `monad_deploys`.

6. **Permissions.**
   - Add `monad.deploy`, `monad.write` to `policy.ts`.
   - Local: auto-allow. Testnet: ask. Mainnet: always-confirm.

7. **Renderer.**
   - **Contracts panel**: list of compiled contracts, per-contract section with ABI summary + Deploy button.
   - **Deploy modal**: dynamic form from constructor ABI using `AbiArgInput` component.
   - **DeployHistoryList** under the Deploy tab: per-project, sortable, filterable, with redeploy + open-in-explorer actions.

8. **Wire types.**
   - `DeployRequest`, `ContractArtifact`, `DeployRecord`.

## Verification

1. Fresh Foundry project, Monad mode on, devnet auto-spawns within 3s of opening.
2. Click "Compile" → contracts list populated; an intentional Solidity error shows as a composer @-mention.
3. Counter contract: click Deploy → permission card auto-allows on local → tx hash + address shown in <5s.
4. Same on testnet with permission ask → confirm → deploy succeeds.
5. Deploy history list shows both deploys with correct network labels.
6. Constructor with `(uint256 initial, string name)`: form generates a numeric input + text input; encoding correct.

## PR scope

One PR titled `feat(monad): local devnet + compile + deploy (#NNN)`. Diff < ~3000 LOC.
