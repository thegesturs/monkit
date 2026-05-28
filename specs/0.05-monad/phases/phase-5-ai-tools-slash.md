# Phase 5 — AI Monad tools + slash commands

**Goal.** The AI agent can drive the whole flow end-to-end with no user clicks beyond initial prompt + permission cards. Composer slash commands cover power-user paths.

## Scope

- Full MCP tool surface in `apps/mcp-server/src/tools/monad.ts`.
- Permission policy hardening for tool calls.
- Composer slash command registration.
- "Vibe-code a contract" intent template.
- `AGENTS.md` baked into starter templates (Phase 6 finalizes).

## Out of scope

- `monad_publish` and explorer tools (some land in Phase 6).
- Streaming event subscriptions via MCP (Phase 7).

## Critical files

- `apps/mcp-server/src/tools/code_search.ts` — registration pattern reference.
- `apps/server/src/provider/drivers/{claude,codex,grok,gemini,cursor,opencode}.ts` — verify each driver advertises the new tools when Monad mode is on.
- `apps/server/src/provider/drivers/acp/` — shared permission policy; extend, don't fork.
- `apps/renderer/src/composer/slash/` — slash command registry.

## Implementation steps

1. **`apps/mcp-server/src/tools/monad.ts`.**
   - Register all tools from [ai-monad-tools.md](../features/ai-monad-tools.md): `monad_get_network`, `monad_get_address`, `monad_balance`, `monad_block_number`, `monad_read`, `monad_estimate_gas`, `monad_call`, `monad_deploy`, `monad_sign_message`, `monad_get_tx`, `monad_codegen`, `monad_switch_network`, `monad_request_faucet`, `monad_wallet_new`, `monad_wallet_list`, `monad_wallet_switch`.
   - Each tool implemented by calling into `packages/monad-core` services via the same Effect runtime as the renderer RPC.

2. **Tool filtering by Monad mode.**
   - When a session's project has Monad mode off, the tools are filtered out of the driver's advertised tool list.
   - Done in the driver bootstrap, not the tool itself (so non-Monad sessions never hear of them).

3. **Permission propagation.**
   - All write tools route through `policy.ts` and surface in the existing permission card UI.
   - Local: auto-allow per session setting. Testnet: ask. Mainnet: always-confirm (no session bypass).

4. **Composer slash commands.**
   - New module `apps/renderer/src/composer/slash/monad-commands.ts`.
   - Commands per [composer-slash.md](../features/composer-slash.md).
   - Hook into existing autocomplete (network ids, wallet labels, contract names, function names).

5. **"Vibe-code a contract" intent template.**
   - New entry in the existing "Try this" prompt list (when Monad mode is on).
   - Pre-loads the chat with: "I'll edit Solidity in `contracts/`, the frontend in `frontend/`, and use `monad_*` tools to deploy. What do you want to build?"

6. **AGENTS.md fragment.**
   - Starter templates (finalized in Phase 6) include AGENTS.md describing the Monad workflow.
   - Phase 5 deliverable: ensure existing agents respect AGENTS.md at session start (already supported by the drivers; verify and document).

## Verification

1. Open a Monad project, ask Claude: "Make me an ERC20 called WAGMI, deploy to local, mint 1000 to my burner, then call balanceOf on me."
2. Observe in chat timeline: edit Solidity → compile → permission card (local auto-allow) → deploy tx → call mint → call balanceOf → report "1000".
3. Toggle to testnet, ask Codex to redeploy. Permission card asks for testnet deploy; confirm.
4. Slash command: `/deploy Counter` → same flow as UI Deploy button.
5. Slash command: `/call Counter increment` → simulate + send.
6. Mainnet: enable, switch to mainnet, ask any agent to deploy → always-confirm modal appears with no session-bypass option.
7. Run a non-Monad project — verify `monad_*` tools are absent from the agent's tool list (check session inspector).

## PR scope

One PR titled `feat(monad): MCP tools, slash commands, agent integration (#NNN)`. Diff < ~3000 LOC.
