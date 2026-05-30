import { Button } from "@/components/ui/button";
import { shortAddress } from "@/lib/utils";
import { useAccount, useConnect, useDisconnect } from "wagmi";

export function Header() {
  const { address, isConnected } = useAccount();
  const { connect, connectors } = useConnect();
  const { disconnect } = useDisconnect();
  const connector = connectors[0];

  return (
    <header className="flex items-center justify-between">
      <h1 className="text-xl font-semibold">Monad dApp</h1>
      {isConnected && address ? (
        <Button variant="outline" onClick={() => disconnect()}>
          {shortAddress(address)}
        </Button>
      ) : (
        <Button onClick={() => connector && connect({ connector })} disabled={!connector}>
          Connect wallet
        </Button>
      )}
    </header>
  );
}
