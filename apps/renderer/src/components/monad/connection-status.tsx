import { RotateCw } from "lucide-react";

import { cn } from "~/lib/utils";
import { useMonadStore } from "../../store/monad.ts";

/**
 * Compact connection indicator for the Monad header: a colored status dot, the
 * active network label, and either the live block height, a "connecting…" hint,
 * or an error reason with a Retry affordance.
 */
export function ConnectionStatus(): React.ReactElement {
  const status = useMonadStore((s) => s.status);
  const label = useMonadStore((s) => s.networkLabel());
  const lastBlock = useMonadStore((s) => s.lastBlock);
  const retry = useMonadStore((s) => s.retry);

  const dotColor =
    status.kind === "live"
      ? "bg-success"
      : status.kind === "error"
        ? "bg-destructive"
        : "bg-warning";

  return (
    <div className="flex min-w-0 items-center gap-2 text-[11px]">
      <span className="relative flex size-2 shrink-0">
        {status.kind === "live" ? (
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-success/60 [animation-duration:2s] motion-reduce:hidden" />
        ) : null}
        <span
          className={cn("relative inline-flex size-2 rounded-full", dotColor)}
        />
      </span>

      <span className="truncate font-medium text-foreground/90">{label}</span>

      {status.kind === "live" ? (
        <span className="shrink-0 font-mono text-muted-foreground tabular-nums">
          #{status.blockNumber.toString()}
        </span>
      ) : status.kind === "connecting" ? (
        <span className="shrink-0 text-muted-foreground">connecting…</span>
      ) : (
        <span className="flex min-w-0 items-center gap-1.5">
          <span
            className="truncate text-destructive-foreground"
            title={status.reason}
          >
            {lastBlock !== null
              ? `stale · #${lastBlock.toString()}`
              : "offline"}
          </span>
          <button
            type="button"
            onClick={retry}
            className="flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <RotateCw className="size-3" />
            Retry
          </button>
        </span>
      )}
    </div>
  );
}
