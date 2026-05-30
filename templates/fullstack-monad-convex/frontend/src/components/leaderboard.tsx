import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { shortAddress } from "@/lib/utils";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";

type Score = { player: string; count: number };

/**
 * Off-chain leaderboard, served by Convex. Only rendered when a Convex backend
 * is available (see pages/index.tsx) so `useQuery` always runs inside a
 * ConvexProvider. On-chain count lives in the Counter contract; the ranking and
 * player rows live off-chain in Convex.
 */
export function Leaderboard() {
  const scores = useQuery(api.counter.topScores) as Score[] | undefined;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Leaderboard</CardTitle>
      </CardHeader>
      <CardContent>
        {scores === undefined ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : scores.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No scores yet — increment the counter to appear here.
          </p>
        ) : (
          <ol className="flex flex-col gap-2">
            {scores.map((s) => (
              <li
                key={s.player}
                className="flex justify-between border-b border-border py-1.5 text-sm last:border-0"
              >
                <span className="font-mono">{shortAddress(s.player)}</span>
                <span>{s.count}</span>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
