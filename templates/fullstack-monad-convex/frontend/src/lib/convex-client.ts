import { ConvexReactClient } from "convex/react";

// The local Convex backend URL is injected at scaffold time (Phase 7) as
// VITE_CONVEX_URL. Until the backend is provisioned the app runs without it and
// Convex-backed widgets show a "backend starting…" state — see leaderboard.tsx.
const url = import.meta.env.VITE_CONVEX_URL;

export const convex = url ? new ConvexReactClient(url) : null;
