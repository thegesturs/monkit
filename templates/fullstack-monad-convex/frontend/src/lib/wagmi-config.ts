import { defineChain } from "viem";
import { http, createConfig } from "wagmi";
import { injected } from "wagmi/connectors";

// Chain definitions mirror packages/monad-core/networks.ts. The app injects a
// burner wallet on the local devnet; the injected() connector lets a browser
// wallet (e.g. MetaMask) connect when the dApp is published.

export const monadLocal = defineChain({
  id: 41454,
  name: "Monad Local",
  nativeCurrency: { name: "Monad", symbol: "MON", decimals: 18 },
  rpcUrls: { default: { http: ["http://127.0.0.1:8545"] } },
});

export const monadTestnet = defineChain({
  id: 10143,
  name: "Monad Testnet",
  nativeCurrency: { name: "Monad", symbol: "MON", decimals: 18 },
  rpcUrls: { default: { http: ["https://testnet-rpc.monad.xyz"] } },
  blockExplorers: {
    default: { name: "Monad Explorer", url: "https://testnet.monadexplorer.com" },
  },
  testnet: true,
});

export const config = createConfig({
  chains: [monadLocal, monadTestnet],
  connectors: [injected()],
  transports: {
    [monadLocal.id]: http(),
    [monadTestnet.id]: http(),
  },
});

declare module "wagmi" {
  interface Register {
    config: typeof config;
  }
}
