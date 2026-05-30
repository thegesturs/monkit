import { CounterCard } from "@/components/counter-card";
import { Header } from "@/components/header";
import { Leaderboard } from "@/components/leaderboard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { convex } from "@/lib/convex-client";

export default function Index() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5 px-5 py-8">
      <Header />
      <CounterCard />
      {convex ? (
        <Leaderboard />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Leaderboard</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Backend starting… (Convex provisions on setup)
          </CardContent>
        </Card>
      )}
    </div>
  );
}
