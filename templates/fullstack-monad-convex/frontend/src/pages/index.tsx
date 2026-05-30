import { Header } from "@/components/header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function Index() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5 px-5 py-10">
      <Header />
      <Card>
        <CardHeader>
          <CardTitle>Your Monad dApp</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          A bare full-stack starter wired for Monad: a Foundry contract, this React + shadcn/ui
          frontend, and a Convex backend. Tell the agent what to build.
        </CardContent>
      </Card>
    </div>
  );
}
