import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

/** Top players by increment count (off-chain leaderboard). */
export const topScores = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("scores").collect();
    return rows.sort((a, b) => b.count - a.count).slice(0, 10);
  },
});

/** Record that `player` incremented the on-chain counter. */
export const recordIncrement = mutation({
  args: { player: v.string() },
  handler: async (ctx, { player }) => {
    const existing = await ctx.db
      .query("scores")
      .withIndex("by_player", (q) => q.eq("player", player))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, { count: existing.count + 1 });
    } else {
      await ctx.db.insert("scores", { player, count: 1 });
    }
  },
});
