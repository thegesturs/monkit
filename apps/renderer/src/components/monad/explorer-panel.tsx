import { ArrowUpRight, Compass } from "lucide-react";
import { useState } from "react";

import { useMonadStore } from "../../store/monad.ts";
import { Button } from "../ui/button.tsx";
import {
  Empty,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
} from "../ui/empty.tsx";
import {
  NETWORK_META,
  explorerAddressUrl,
  explorerBlockUrl,
  explorerTxUrl,
  openExternal,
} from "./lib/format.ts";

/**
 * Explorer is a real, backend-free deep-link surface: it opens the public
 * Monad explorer for the active network. A full in-app indexed tx history is
 * future work (needs a server-side indexer + log decoder).
 */
export function ExplorerPanel(): React.ReactElement {
  const network = useMonadStore((s) => s.activeNetwork);
  const lastBlock = useMonadStore((s) => s.lastBlock);
  const [query, setQuery] = useState("");

  const meta = NETWORK_META[network];

  if (meta.explorerUrl === null) {
    return (
      <Empty className="py-10">
        <EmptyMedia variant="icon">
          <Compass />
        </EmptyMedia>
        <EmptyTitle>No explorer for {meta.label}</EmptyTitle>
        <EmptyDescription>
          The local devnet has no public explorer. Switch to Testnet to browse
          transactions, blocks, and addresses.
        </EmptyDescription>
      </Empty>
    );
  }

  const trimmed = query.trim();
  const isTx = /^0x[a-fA-F0-9]{64}$/.test(trimmed);
  const isAddress = /^0x[a-fA-F0-9]{40}$/.test(trimmed);
  const lookupUrl = isTx
    ? explorerTxUrl(network, trimmed)
    : isAddress
      ? explorerAddressUrl(network, trimmed)
      : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 p-3">
      <div className="flex flex-col gap-2 rounded-xl border border-border bg-card p-3">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Look up
        </span>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && lookupUrl) openExternal(lookupUrl);
          }}
          placeholder="Address (0x…40) or tx hash (0x…64)"
          className="w-full rounded-lg border border-input bg-background px-3 py-2 font-mono text-xs text-foreground outline-none ring-ring/24 transition-shadow placeholder:font-sans placeholder:text-muted-foreground/72 focus-visible:border-ring focus-visible:ring-[3px]"
        />
        <Button
          size="sm"
          disabled={lookupUrl === null}
          onClick={() => lookupUrl && openExternal(lookupUrl)}
        >
          {isTx
            ? "Open transaction"
            : isAddress
              ? "Open address"
              : "Paste an address or tx hash"}
        </Button>
      </div>

      <div className="flex flex-col gap-1.5">
        <ExplorerLink
          label={`${meta.label} explorer`}
          sub={meta.explorerUrl}
          onClick={() => openExternal(meta.explorerUrl!)}
        />
        {lastBlock !== null ? (
          <ExplorerLink
            label="Latest block"
            sub={`#${lastBlock.toString()}`}
            onClick={() => {
              const url = explorerBlockUrl(network, lastBlock);
              if (url) openExternal(url);
            }}
          />
        ) : null}
      </div>
    </div>
  );
}

function ExplorerLink({
  label,
  sub,
  onClick,
}: {
  label: string;
  sub: string;
  onClick: () => void;
}): React.ReactElement {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex items-center justify-between gap-2 rounded-lg border border-border bg-card px-3 py-2.5 text-left transition-colors hover:border-foreground/20 hover:bg-muted/40"
    >
      <div className="flex min-w-0 flex-col">
        <span className="text-sm font-medium text-foreground">{label}</span>
        <span className="truncate font-mono text-[11px] text-muted-foreground">
          {sub}
        </span>
      </div>
      <ArrowUpRight className="size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground" />
    </button>
  );
}
