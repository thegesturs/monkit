import { Lock } from "lucide-react";

import type { NetworkId } from "@memoize/wire";

import { cn } from "~/lib/utils";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip.tsx";
import { useMonadStore } from "../../store/monad.ts";
import { NETWORK_META } from "./lib/format.ts";

const SELECTABLE: readonly NetworkId[] = ["local", "testnet"];

/**
 * Local / Testnet / Mainnet segmented control. Mainnet is locked behind a
 * settings gate for now (full mainnet guardrails — confirm modal, cooldown —
 * are future work per ADR 0007), so it renders as a disabled pill.
 */
export function NetworkSwitcher(): React.ReactElement {
  const active = useMonadStore((s) => s.activeNetwork);
  const setNetwork = useMonadStore((s) => s.setActiveNetwork);

  return (
    <div className="inline-flex items-center gap-0.5 rounded-lg border border-border bg-muted/40 p-0.5">
      {SELECTABLE.map((id) => {
        const selected = active === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => {
              if (!selected) void setNetwork(id);
            }}
            aria-pressed={selected}
            className={cn(
              "rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors",
              selected
                ? "bg-primary text-primary-foreground shadow-xs"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {NETWORK_META[id].short}
          </button>
        );
      })}

      <Tooltip>
        <TooltipTrigger
          render={
            <button
              type="button"
              disabled
              className="flex cursor-not-allowed items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-medium text-muted-foreground/50"
            >
              <Lock className="size-3" />
              {NETWORK_META.mainnet.short}
            </button>
          }
        />
        <TooltipPopup>
          Mainnet is disabled — enable it in Settings.
        </TooltipPopup>
      </Tooltip>
    </div>
  );
}
