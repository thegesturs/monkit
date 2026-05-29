import { Effect } from "effect";
import { Plus, Wallet } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import type { WalletMetadata } from "@memoize/wire";

import { getRpcClient } from "../../lib/rpc-client.ts";
import { useMonadStore } from "../../store/monad.ts";
import { Button } from "../ui/button.tsx";
import {
  Empty,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
} from "../ui/empty.tsx";
import { SignMessageDialog } from "./sign-message-dialog.tsx";
import { WalletCard } from "./wallet-card.tsx";
import { NETWORK_META, openExternal } from "./lib/format.ts";

export function WalletPanel(): React.ReactElement {
  const network = useMonadStore((s) => s.activeNetwork);
  const [wallets, setWallets] = useState<readonly WalletMetadata[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signTarget, setSignTarget] = useState<WalletMetadata | null>(null);

  const reload = useCallback(async () => {
    try {
      const client = await getRpcClient();
      const list = await Effect.runPromise(client.monad["wallet.list"]({}));
      setWallets(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const createBurner = async () => {
    setCreating(true);
    setError(null);
    try {
      const client = await getRpcClient();
      await Effect.runPromise(client.monad["wallet.createBurner"]({}));
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setCreating(false);
    }
  };

  const faucetUrl = NETWORK_META[network].faucetUrl;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between gap-2 px-3 py-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Wallets
        </h2>
        <div className="flex items-center gap-1.5">
          {faucetUrl !== null ? (
            <Button
              variant="outline"
              size="xs"
              onClick={() => openExternal(faucetUrl)}
            >
              Faucet
            </Button>
          ) : null}
          <Button
            size="xs"
            loading={creating}
            onClick={() => void createBurner()}
          >
            <Plus />
            New burner
          </Button>
        </div>
      </div>

      {error !== null ? (
        <p className="mx-3 mb-2 rounded-md bg-destructive/10 px-2.5 py-1.5 text-xs text-destructive-foreground">
          {error}
        </p>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
        {loading ? (
          <div className="flex flex-col gap-2">
            {[0, 1].map((i) => (
              <div
                key={i}
                className="h-[92px] animate-pulse rounded-xl border border-border bg-muted/30"
              />
            ))}
          </div>
        ) : wallets.length === 0 ? (
          <Empty className="py-10">
            <EmptyMedia variant="icon">
              <Wallet />
            </EmptyMedia>
            <EmptyTitle>No wallets yet</EmptyTitle>
            <EmptyDescription>
              Create a burner wallet to deploy contracts and sign messages. Keys
              are stored in your OS keychain — never on disk.
            </EmptyDescription>
            <Button
              className="mt-2"
              size="sm"
              loading={creating}
              onClick={() => void createBurner()}
            >
              <Plus />
              Create burner wallet
            </Button>
          </Empty>
        ) : (
          <div className="flex flex-col gap-2">
            {wallets.map((w) => (
              <WalletCard
                key={w.id}
                wallet={w}
                network={network}
                onSign={setSignTarget}
              />
            ))}
          </div>
        )}
      </div>

      <SignMessageDialog
        wallet={signTarget}
        onClose={() => setSignTarget(null)}
      />
    </div>
  );
}
