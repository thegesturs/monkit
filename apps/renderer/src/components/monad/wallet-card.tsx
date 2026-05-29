import { Effect } from "effect";
import { Check, Copy, ExternalLink, PenLine, RotateCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import type { NetworkId, WalletMetadata } from "@memoize/wire";

import { cn } from "~/lib/utils";
import { getRpcClient } from "../../lib/rpc-client.ts";
import {
  explorerAddressUrl,
  formatBalance,
  openExternal,
  truncateAddress,
} from "./lib/format.ts";

type BalanceState =
  | { kind: "loading" }
  | { kind: "value"; wei: bigint }
  | { kind: "error" };

const BALANCE_POLL_MS = 8_000;

export function WalletCard({
  wallet,
  network,
  onSign,
}: {
  wallet: WalletMetadata;
  network: NetworkId;
  onSign: (wallet: WalletMetadata) => void;
}): React.ReactElement {
  const [balance, setBalance] = useState<BalanceState>({ kind: "loading" });
  const [copied, setCopied] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const client = await getRpcClient();
      const wei = await Effect.runPromise(
        client.monad["wallet.getBalance"]({ address: wallet.address }),
      );
      setBalance({ kind: "value", wei });
    } catch {
      setBalance({ kind: "error" });
    }
  }, [wallet.address]);

  // Refetch on mount, when the network changes, and on a slow poll.
  useEffect(() => {
    setBalance({ kind: "loading" });
    void refresh();
    const t = setInterval(() => void refresh(), BALANCE_POLL_MS);
    return () => clearInterval(t);
  }, [refresh, network]);

  const copyAddress = () => {
    void navigator.clipboard.writeText(wallet.address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };

  const explorer = explorerAddressUrl(network, wallet.address);

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border bg-card p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate font-medium text-sm text-foreground">
            {wallet.label ?? "Burner wallet"}
          </span>
          <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            {wallet.source}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          <IconButton title="Sign a message" onClick={() => onSign(wallet)}>
            <PenLine className="size-3.5" />
          </IconButton>
          {explorer ? (
            <IconButton
              title="View on explorer"
              onClick={() => openExternal(explorer)}
            >
              <ExternalLink className="size-3.5" />
            </IconButton>
          ) : null}
        </div>
      </div>

      <button
        type="button"
        onClick={copyAddress}
        title="Copy address"
        className="group flex items-center gap-1.5 self-start font-mono text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        {truncateAddress(wallet.address)}
        {copied ? (
          <Check className="size-3 text-success" />
        ) : (
          <Copy className="size-3 opacity-0 transition-opacity group-hover:opacity-70" />
        )}
      </button>

      <div className="flex items-center justify-between border-t border-border/60 pt-2">
        <span className="text-[11px] text-muted-foreground">Balance</span>
        <div className="flex items-center gap-1.5">
          <span
            className={cn(
              "font-mono text-sm tabular-nums",
              balance.kind === "value"
                ? "text-foreground"
                : "text-muted-foreground",
            )}
          >
            {balance.kind === "loading"
              ? "…"
              : balance.kind === "error"
                ? "—"
                : formatBalance(balance.wei)}
          </span>
          <IconButton title="Refresh balance" onClick={() => void refresh()}>
            <RotateCw className="size-3" />
          </IconButton>
        </div>
      </div>
    </div>
  );
}

function IconButton({
  children,
  title,
  onClick,
}: {
  children: React.ReactNode;
  title: string;
  onClick: () => void;
}): React.ReactElement {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className="flex size-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
    >
      {children}
    </button>
  );
}
