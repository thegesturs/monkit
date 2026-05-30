import React from "react";
import ReactDOM from "react-dom/client";
import { WagmiProvider } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ConvexProvider } from "convex/react";

import { config } from "./wagmi-config";
import { convex } from "./convex-client";
import App from "./App";
import "./styles.css";

const queryClient = new QueryClient();

const tree = (
  <WagmiProvider config={config}>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </WagmiProvider>
);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {convex ? <ConvexProvider client={convex}>{tree}</ConvexProvider> : tree}
  </React.StrictMode>,
);
