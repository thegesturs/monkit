import {
  useAccount,
  useChainId,
  useConnect,
  useDisconnect,
  useReadContract,
  useWriteContract,
} from "wagmi";

import { COUNTER_ABI } from "./contracts/abis";
import { getAddress } from "./contracts/index";
import { convex } from "./convex-client";
import { Leaderboard } from "./Leaderboard";

export default function App() {
  const { address, isConnected } = useAccount();
  const { connect, connectors } = useConnect();
  const { disconnect } = useDisconnect();
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
      { onSuccess: () => setTimeout(() => refetch(), 1500) },
    );
  };

  return (
    <main className="app">
      <header>
        <h1>Monad dApp</h1>
        {isConnected ? (
          <button onClick={() => disconnect()}>
            {address?.slice(0, 6)}…{address?.slice(-4)}
          </button>
        ) : (
          <button onClick={() => connect({ connector: connectors[0]! })}>
            Connect wallet
          </button>
        )}
      </header>

      <section className="card">
        <h2>Counter</h2>
        {counter ? (
          <>
            <p className="count">{count?.toString() ?? "…"}</p>
            <button onClick={increment} disabled={!isConnected || isPending}>
              {isPending ? "Incrementing…" : "Increment"}
            </button>
          </>
        ) : (
          <p className="hint">
            Deploy your <code>Counter</code> contract to get started — the
            address wires in automatically.
          </p>
        )}
      </section>

      {convex ? (
        <Leaderboard />
      ) : (
        <section className="card">
          <h2>Leaderboard</h2>
          <p className="hint">Backend starting… (Convex provisions on setup)</p>
        </section>
      )}
    </main>
  );
}
