# Phase 9 — Project Plan panel

**Goal.** The agent makes a clean, ordered plan and the user can see which step is happening right now. A
pinned **Project Plan** panel renders the agent's `TodoWrite` stream with per-step status (done /
in-progress / pending), an "N of M Done" counter, and a collapse toggle.

See [features/project-plan.md](../features/project-plan.md).

## Scope

- Pinned Project Plan panel in the chat, driven by the agent's `TodoWrite` calls.
- Per-step status glyphs + current-step highlight + "N of M Done" + collapse/expand.
- Agent-behavior instructions (plan first, one step `in_progress`, update as you go) in `AGENTS.md` + the
  Monad system preset.
- Simple-mode integration: suppress the inline `TodoWrite` tool row so the panel is the single source.

## Out of scope

- User-editable / reorderable steps (read-only in v1).
- Sub-agent nested plans (top-level only).
- Persisting a finished plan as an artifact.

## Critical files

- `packages/wire/src/agent.ts` — `TodoWrite` is already in the normalized tool contract; optionally add a
  typed `TodoItem` schema (`{ content, status, activeForm? }`) — additive.
- `apps/renderer/src/store/messages.ts` — derive the latest `TodoWrite` state for the active session.
- `apps/renderer/src/components/project-plan-panel.tsx` (new) — the panel.
- `apps/renderer/src/components/chat-view.tsx` — pin the panel above the composer while a turn runs.
- `apps/renderer/src/components/tool-row.tsx` — existing `TodoWrite` case; gate inline rendering off when
  the panel is shown.
- `apps/server/src/provider/drivers/planMode.ts` — reuse the dev-instructions-prefix mechanism to nudge
  non-native providers (Codex/Grok/Gemini) to emit todos.
- `templates/*/AGENTS.md` — the plan-and-update instructions.

## Implementation steps

1. **(Optional) Type the todo item.** Add a `TodoItem` schema in `agent.ts` so the renderer reads typed
   `{ content, status, activeForm? }` instead of `Schema.Unknown`. Keep `TodoWrite` input back-compatible.

2. **Derive latest plan.** In `messages.ts`, fold the session's event/message stream to the most recent
   `TodoWrite` payload; expose `currentPlan: TodoItem[] | null`. A new `TodoWrite` fully replaces the prior
   list (it's the agent's complete current plan).

3. **`project-plan-panel.tsx`.**
   - Header: "Project Plan", `N of M Done` (M = total, N = completed), spinner while any step is
     `in_progress`, collapse chevron.
   - Rows: vertical timeline; glyph per status (check / spinner / dashed circle); highlight the
     `in_progress` row; plain-language text (`activeForm` when present and running, else `content`).
   - Empty/none → render nothing.

4. **Pin in chat.** Mount the panel in `chat-view.tsx` above the composer; sticky while the turn is active;
   stays visible (collapsed-able) after completion for the turn.

5. **Single source of truth.** In `tool-row.tsx`, suppress the inline `TodoWrite` row when the pinned panel
   is active (always in Simple mode) so the plan isn't rendered twice.

6. **Agent behavior.** Add to `AGENTS.md` + the Monad system preset: start multi-step builds with a
   `TodoWrite` plan (5–10 concrete, plain-language steps), keep exactly one `in_progress`, mark
   `completed` promptly, advance. Wire the dev-instructions nudge for non-native providers via
   `planMode.ts`'s prefix mechanism.

## Verification

1. Prompt a multi-step build (e.g. "build an NFT mint with a gallery") → the agent calls `TodoWrite`; the
   Project Plan panel appears with an ordered list and "0 of N Done".
2. As the agent works, exactly one step shows the spinner + highlight; completed steps flip to green checks;
   the counter increments.
3. Collapse/expand works; collapsed shows header + counter only.
4. In Simple mode, the plan renders **only** in the pinned panel (no duplicate inline TodoWrite row), and
   step text is plain-language.
5. A non-native provider (e.g. Codex/Grok) still produces a plan via the dev-instructions nudge, or — if it
   emits no todos — the panel simply doesn't appear (no errors).
6. Plan mode (`ExitPlanMode`) approval → execution begins and drives the panel; the two coexist.

## PR scope

One PR titled `feat(monad): project plan panel + plan-and-update agent behavior (#NNN)`. Diff < ~1500 LOC.
