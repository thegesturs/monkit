import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { COUNTER_ABI, getAddress } from "@/contracts";
import { toast } from "sonner";
import { useAccount, useChainId, useReadContract, useWriteContract } from "wagmi";

export function CounterCard() {
  const { isConnected } = useAccount();
  const chainId = useChainId();
  const counter = getAddress("Counter", chainId);

  const { data: count, refetch } = useReadContract({
    abi: COUNTER_ABI,
    address: counter,
    functionName: "count",
    query: { enabled: Boolean(counter) },
  });

  const { writeContract, isPending } = useWriteContract();

  const increment = () => {
    if (!counter) return;
    writeContract(
      { abi: COUNTER_ABI, address: counter, functionName: "increment" },
      {
        onSuccess: (hash) => {
          toast.success("Incremented", { description: hash });
          setTimeout(() => refetch(), 1500);
        },
        onError: (error) => toast.error("Transaction failed", { description: error.message }),
      },
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Counter</CardTitle>
      </CardHeader>
      <CardContent>
        {counter ? (
          <div className="flex items-center justify-between">
            <span className="text-5xl font-bold tabular-nums">{count?.toString() ?? "…"}</span>
            <Button onClick={increment} disabled={!isConnected || isPending}>
              {isPending ? "Incrementing…" : "Increment"}
            </Button>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Deploy your <code className="font-mono">Counter</code> contract to get started — the
            address wires in automatically.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
