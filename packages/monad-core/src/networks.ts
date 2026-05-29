import { Schema } from "effect";
import { type ChainId, type NetworkId, UnknownNetworkError } from "./schema.js";

/**
 * Static network registry for Phase 1.
 * Values should be confirmed against current Monad public docs at implementation time.
 */
export interface NetworkConfig {
  readonly id: NetworkId;
  readonly chainId: ChainId;
  readonly name: string;
  readonly rpcUrl: string;
  readonly explorerUrl: string | null;
}

export const NETWORKS: Record<NetworkId, NetworkConfig> = {
  local: {
    id: "local",
    chainId: 41454 as ChainId, // Common local anvil/dev fork id; adjust if Monad publishes an official one
    name: "Local Devnet",
    rpcUrl: "http://127.0.0.1:8545",
    explorerUrl: null,
  },
  testnet: {
    id: "testnet",
    // Monad testnet chain ID (10143 as of late 2025 public info). Verify at runtime.
    chainId: 10143 as ChainId,
    name: "Monad Testnet",
    rpcUrl: "https://testnet-rpc.monad.xyz",
    explorerUrl: "https://testnet.monadexplorer.com",
  },
  mainnet: {
    id: "mainnet",
    // Placeholder — mainnet not yet live at time of writing. Will be updated when launched.
    chainId: 260 as ChainId,
    name: "Monad Mainnet",
    rpcUrl: "https://rpc.monad.xyz",
    explorerUrl: "https://explorer.monad.xyz",
  },
};

export const listNetworks = (): readonly NetworkConfig[] => Object.values(NETWORKS);

export const getNetwork = (id: NetworkId): NetworkConfig => {
  const net = NETWORKS[id];
  if (!net) throw new UnknownNetworkError({ networkId: id });
  return net;
};

export const getNetworkByChainId = (chainId: ChainId): NetworkConfig | undefined =>
  listNetworks().find((n) => n.chainId === chainId);

export type { NetworkId } from "./schema.js"; // re-export for convenience (string literal in Phase 1)
