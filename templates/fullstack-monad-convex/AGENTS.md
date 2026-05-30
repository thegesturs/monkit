# AGENTS.md — how to work in this project

This is a **Monad dApp**. It is full-stack:

- `contracts/` — Solidity contracts (Foundry). The on-chain layer.
- `frontend/` — Vite + React + wagmi v2 + viem. The UI.
- `frontend/convex/` — Convex backend (database + auth). The off-chain layer.

## Golden rules

- **Deploy with `monad_deploy`.** Interact with `monad_call` (writes) and `monad_read` (views).
- **Never copy-paste an address.** `frontend/src/contracts/addresses.ts` and `abis.ts` are
  **auto-generated on every deploy** (they start with `// @generated`). Read them; don't hand-edit them.
- **Run `forge test` before deploying.** Tests live in `contracts/test/`.
- **The dev environment runs a local devnet automatically.** Default to `local` for iteration; testnet is a
  deliberate switch.

## On-chain vs off-chain — where things go

Put it **on-chain** (Solidity) only if it's value, ownership, or trust-critical logic.
Put everything else **in Convex** (`frontend/convex/`):

| On-chain (`contracts/`) | Off-chain (`frontend/convex/`) |
| --- | --- |
| token balances, ownership, settlement | user accounts, sessions, auth |
| trust-critical logic | profiles, display names |
| anything others must verify | leaderboards, scores, history, feeds |

Convex functions are queries/mutations in `frontend/convex/*.ts`; the schema is
`frontend/convex/schema.ts`; the frontend reads them via `useQuery` / `useMutation`. The local Convex
backend URL is injected as `VITE_CONVEX_URL`; until it's provisioned, Convex-backed widgets show a
"backend starting…" state — don't remove that guard.

## Frontend conventions

- **Files are kebab-case** (`counter-card.tsx`, `not-found.tsx`). Components live in
  `frontend/src/components/`, pages in `frontend/src/pages/`, shared code in `frontend/src/lib/`.
- **UI uses shadcn/ui** — reuse primitives in `frontend/src/components/ui/` (button, card, badge) and add
  more with the shadcn pattern. Merge classes with `cn()` from `@/lib/utils`. Import via the `@/` alias.
- **Styling is Tailwind v4** with theme tokens in `src/index.css` (dark by default). Prefer tokens
  (`bg-card`, `text-muted-foreground`) over hard-coded colors.
- **Lint + format with Biome**: `bun run lint`, `bun run format`. Keep the tree clean.
- Toasts via `sonner` (`toast.success(...)`); routing via `react-router-dom`.

## Work the plan visibly

For any multi-step build:

1. **Start by calling `TodoWrite`** with a short, ordered plan (5–10 concrete steps).
2. Keep **exactly one** step `in_progress` at a time; mark it `completed` the moment it's done, then move on.
3. Write step text in **plain language a non-developer understands** ("Create the mint page", not
   "scaffold LaunchForm.tsx"). The user watches this plan.

## Example prompts

- "Add an ERC-20 token called WAGMI, mint 1000 to my wallet, then show the balance."
- "Add a leaderboard ranking players by how many times they've clicked increment."
- "Deploy to testnet and publish the frontend."
