import type { NetworkId } from "@memoize/wire";

/** Static network presentation data, mirrored from packages/monad-core/networks.ts. */
export const NETWORK_META: Record<
  NetworkId,
  {
    readonly label: string;
    readonly short: string;
    readonly explorerUrl: string | null;
    readonly faucetUrl: string | null;
  }
> = {
  local: {
    label: "Local Devnet",
    short: "Local",
    explorerUrl: null,
    faucetUrl: null,
  },
  testnet: {
    label: "Monad Testnet",
    short: "Testnet",
    explorerUrl: "https://testnet.monadexplorer.com",
    faucetUrl: "https://faucet.monad.xyz",
  },
  mainnet: {
    label: "Monad Mainnet",
    short: "Mainnet",
    explorerUrl: "https://explorer.monad.xyz",
    faucetUrl: null,
  },
};

/** `0x1234…abcd` — keeps the first 6 and last 4 hex chars. */
export function truncateAddress(address: string, head = 6, tail = 4): string {
  if (address.length <= head + tail + 1) return address;
  return `${address.slice(0, head)}…${address.slice(-tail)}`;
}

const WEI_PER_ETHER = 1_000_000_000_000_000_000n; // 1e18

/** Native balance (wei → MON) with a sensible number of decimals. */
export function formatBalance(wei: bigint, decimals = 4): string {
  const whole = wei / WEI_PER_ETHER;
  const remainder = wei % WEI_PER_ETHER;
  if (remainder === 0n) return `${whole.toString()} MON`;
  // Pad fractional part to 18 digits, then keep `decimals` and trim trailing 0s.
  const fracFull = remainder.toString().padStart(18, "0");
  const frac = fracFull.slice(0, decimals).replace(/0+$/, "");
  return frac === ""
    ? `${whole.toString()} MON`
    : `${whole.toString()}.${frac} MON`;
}

export function explorerAddressUrl(
  networkId: NetworkId,
  address: string,
): string | null {
  const base = NETWORK_META[networkId].explorerUrl;
  return base ? `${base}/address/${address}` : null;
}

export function explorerTxUrl(
  networkId: NetworkId,
  txHash: string,
): string | null {
  const base = NETWORK_META[networkId].explorerUrl;
  return base ? `${base}/tx/${txHash}` : null;
}

export function explorerBlockUrl(
  networkId: NetworkId,
  block: bigint | number,
): string | null {
  const base = NETWORK_META[networkId].explorerUrl;
  return base ? `${base}/block/${block.toString()}` : null;
}

/** Open a URL in the user's real browser (Electron) or a new tab (web/dev). */
export function openExternal(url: string): void {
  const bridge = window.memoize?.app;
  if (bridge !== undefined) {
    bridge.openExternal(url);
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
}
