# Feature: Project Plan panel (visible, step-by-step execution)

## Why

A vibe coder asks for a lot in one sentence ("build an NFT mint with a gallery and a leaderboard"). The
agent should **make a plan, work it cleanly, and show which step is happening right now** — not disappear
into a wall of tool calls. A persistent **Project Plan** panel turns the agent's work into a checklist the
user can follow at a glance: what's done, what's running, what's next.

This is both an agent-behavior change (plan, then execute step by step) and a UI surface (render the plan
with live per-step status).

## What it looks like

A pinned panel in the chat, just above the composer:

- Header: **"Project Plan"** + an **"N of M Done"** counter + a spinner while a step is running + a
  collapse/expand chevron.
- A vertical timeline of steps, each with a status glyph:
  - ✅ **completed** — green check.
  - ◌ **in_progress** — animated spinner; the row is highlighted (the "current step").
  - ○ **pending** — dotted/empty circle.
- Steps are connected by a vertical line. The current step is visually emphasized.
- Collapsible; collapses to just the header + counter when the user wants room.

## Data source — reuse the existing `TodoWrite` channel

The agent protocol already carries this. The normalized tool contract in
`packages/wire/src/agent.ts` defines:

```
TodoWrite   { todos: [...] }   → result ""
```

emitted as a `ToolUseEvent { tool: "TodoWrite", input: { todos } }`. Each todo is
`{ content, status: "pending" | "in_progress" | "completed", activeForm? }` (the Claude-style shape every
driver normalizes to via `apps/server/src/provider/drivers/acp/translate.ts`).

**The Project Plan panel renders the latest `TodoWrite` state for the active turn/session** — not a new
event type. We promote `TodoWrite` from a one-off inline tool row into a pinned, deduplicated, status-aware
panel. Each new `TodoWrite` call replaces the displayed list (it's the agent's full current plan), so the
panel always reflects the newest plan.

Optionally formalize the item shape in `agent.ts` as a `TodoItem` schema so the renderer parses typed data
instead of `Schema.Unknown` — additive, no protocol break.

## Agent behavior — plan cleanly, update as you go

Encoded in template `AGENTS.md` (and the Monad system preset) so every provider does it:

- "For any multi-step build, **start by calling `TodoWrite` with a short, ordered plan** (5–10 concrete
  steps)."
- "Mark exactly **one** step `in_progress` at a time; mark it `completed` the moment it's done, then advance
  the next step. Keep the list current — it's what the user watches."
- "Keep step text in plain language a non-developer understands (e.g. 'Create the mint page', not 'scaffold
  LaunchForm.tsx')." — pairs with [simple-mode.md](./simple-mode.md).

Claude/Cursor support `TodoWrite` natively; Codex/Grok/Gemini are nudged via the same dev-instructions
prefix mechanism already used for plan mode (`apps/server/src/provider/drivers/planMode.ts`). Providers that
never emit todos simply show no panel — graceful no-op.

## Rendering

- New `apps/renderer/src/components/project-plan-panel.tsx`.
- Pinned in `apps/renderer/src/components/chat-view.tsx`, above the composer, visible while a turn runs.
- Latest-todo derivation in `apps/renderer/src/store/messages.ts` (fold the message/event stream to the most
  recent `TodoWrite` for the session).
- `apps/renderer/src/components/tool-row.tsx` already has the `TodoWrite` case; in Simple mode, suppress the
  inline `TodoWrite` row so the pinned panel is the single source of truth (avoid double-rendering).
- Status glyphs reuse the existing icon set (Lucide): check, spinner, circle-dashed.

## Interaction with plan mode

Distinct from the SDK's read-only **plan mode** (`PermissionMode: "plan"` → `ExitPlanMode`, which proposes a
plan for approval *before* acting). The Project Plan panel tracks **execution** of the agreed work. They
compose: approve in plan mode → agent starts executing and drives the Project Plan panel.

## Out of scope

- User-editable plan steps (drag/reorder/check off by hand) — defer; v1 is agent-driven, read-only.
- Persisting/reopening a completed plan as an artifact — defer.
- Sub-agent nested plans — show only the top-level agent's plan in v1.

## Related

- [simple-mode.md](./simple-mode.md) — plain-language step text; single-source-of-truth rendering.
- [templates.md](./templates.md) — `AGENTS.md` is where the plan-and-update behavior is taught.
