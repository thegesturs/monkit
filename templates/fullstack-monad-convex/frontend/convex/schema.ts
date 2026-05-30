import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// Off-chain data lives here — accounts, profiles, feeds, leaderboards, sessions.
// On-chain stays minimal (value / ownership / trust-critical logic).
// Replace the example table below with your app's data.
export default defineSchema({
  examples: defineTable({
    text: v.string(),
  }),
});
