# Phase 4 — Frontend auto-wire + ABI bindings

**Goal.** Every deploy auto-updates the frontend bindings. The user can call functions from an in-app ABI-driven panel and see the frontend hot-reload with the new address.

## Scope

- `monad.config.json` reading + writing.
- Codegen of `addresses.ts`, `abis.ts`, `hooks.ts` into the frontend.
- `ContractFunctionForm` for read/write/event interaction.
- Frontend dev server runner integrated with terminals.

## Out of scope

- AI MCP tools (Phase 5).
- Frontend publish (Phase 6).

## Critical files

- `apps/server/src/monad/layer.ts` — add `Codegen`, `FrontendRunner` services.
- `packages/monad-core/src/` — add `codegen.ts`, `frontend.ts`.
- `packages/monad-ui/src/ContractFunctionForm.tsx`, `AbiArgInput.tsx`.
- `apps/renderer/src/components/right-pane.tsx` — Contracts tab now hosts function form per deployed contract.

## Implementation steps

1. **`monad.config.json` handling.**
   - Read on Monad mode enable; create with defaults if missing.
   - Hot-reload on file change (watcher).
   - Schema validation via Effect Schema.

2. **`monad-core/codegen.ts`.**
   - On successful deploy, generate the three files in `<frontendDir>/src/contracts/`.
   - All files start with `// @generated`.
   - Refuse to overwrite files lacking the header — log warning.
   - Merges with existing `addresses.ts` to preserve other-network addresses for the contract.

3. **`AbiArgInput`.**
   - Inputs per Solidity type (uint*, int*, address, bytes*, string, bool, arrays, tuples).
   - Address picker integration with deploy history (a contract name resolves to its current address on active network).

4. **`ContractFunctionForm`.**
   - Three sections: Read / Write / Events.
   - Reads: zero-arg functions auto-execute on mount and re-execute on block.
   - Writes: simulate via viem `simulateContract` before send. Banner on simulation revert.
   - Events: subscription toggle, decoded entries appended live.

5. **`monad-core/frontend.ts`.**
   - Detect frontend package manager (bun > pnpm > yarn > npm based on lockfile).
   - Spawn `<pm> run dev` via existing PTY infra in a "Frontend" terminal.
   - Status chip: "Frontend dev: running on http://localhost:5173" / "stopped" / "errors".

6. **In-app browser integration.**
   - When frontend dev server is up, the existing in-app browser tab gets a "Open frontend" shortcut pointing at the detected URL.

7. **Wire types.**
   - `CallRequest`, `ReadRequest`, `EventSubscribeReq`, `CodegenRequest`.

## Verification

1. Counter project, deploy locally → `frontend/src/contracts/{addresses.ts, abis.ts, hooks.ts}` appear.
2. Re-deploy → addresses file updated; ABI file unchanged.
3. Deploy to testnet → addresses file now has both `local` and `testnet` entries for Counter.
4. ContractFunctionForm shows Counter's `count()` (read, auto-updating) and `increment()` (write).
5. Click `increment()` → permission card → tx fires → count rerenders.
6. Frontend dev server auto-starts; visit URL in the in-app browser → React Counter button works against local devnet using the codegen'd hooks.
7. Codegen safety: hand-edit `addresses.ts` (remove `// @generated`) → next deploy logs a warning and skips overwriting.

## PR scope

One PR titled `feat(monad): frontend auto-wire codegen + interact panel + dev server (#NNN)`. Diff < ~2500 LOC.
