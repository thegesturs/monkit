import { useQuery } from "convex/react";
import { api } from "../convex/_generated/api";

type Score = { player: string; count: number };

/**
 * Off-chain leaderboard, served by Convex. This component only renders when a
 * Convex backend is available (see App.tsx) so `useQuery` always runs inside a
 * ConvexProvider. The on-chain count lives in the Counter contract; the ranking
 * and player rows live off-chain in Convex.
 */
export function Leaderboard() {
  const scores = useQuery(api.counter.topScores) as Score[] | undefined;

  return (
    <section className="card">
      <h2>Leaderboard</h2>
      {scores === undefined ? (
        <p className="hint">Loading…</p>
      ) : scores.length === 0 ? (
        <p className="hint">No scores yet — increment the counter to appear here.</p>
      ) : (
        <ol className="leaderboard">
          {scores.map((s) => (
            <li key={s.player}>
              <span className="mono">
                {s.player.slice(0, 6)}…{s.player.slice(-4)}
              </span>
              <span>{s.count}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
