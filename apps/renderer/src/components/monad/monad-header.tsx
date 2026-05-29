import { ConnectionStatus } from "./connection-status.tsx";
import { NetworkSwitcher } from "./network-switcher.tsx";

/**
 * Persistent header shown above every Monad sub-tab so the network, connection
 * state, and live block height stay visible no matter which panel is open —
 * making Wallet / Deploy / Contracts / Explorer read as one cohesive surface.
 */
export function MonadHeader(): React.ReactElement {
  return (
    <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border bg-muted/25 px-3 py-2">
      <NetworkSwitcher />
      <ConnectionStatus />
    </div>
  );
}
