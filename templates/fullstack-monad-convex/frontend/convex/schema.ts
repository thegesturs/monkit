import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// Off-chain tables. Onchain stays minimal (the Counter value); user-facing
// state like the leaderboard lives here. Add accounts, profiles, sessions, etc.
export default defineSchema({
  scores: defineTable({
    player: v.string(),
    count: v.number(),
  }).index("by_player", ["player"]),
});
