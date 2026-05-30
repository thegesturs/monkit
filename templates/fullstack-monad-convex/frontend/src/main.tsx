import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ConvexProvider } from "convex/react";
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { Toaster } from "sonner";
import { WagmiProvider } from "wagmi";

import App from "@/app";
import { convex } from "@/lib/convex-client";
import { config } from "@/lib/wagmi-config";
import "@/index.css";

const queryClient = new QueryClient();

const tree = (
  <WagmiProvider config={config}>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
      <Toaster richColors position="top-center" />
    </QueryClientProvider>
  </WagmiProvider>
);

// biome-ignore lint/style/noNonNullAssertion: #root is always present in index.html
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {convex ? <ConvexProvider client={convex}>{tree}</ConvexProvider> : tree}
  </React.StrictMode>,
);
