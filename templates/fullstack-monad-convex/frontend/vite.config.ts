import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Static build so the dApp can be published to IPFS / any static host.
export default defineConfig({
  plugins: [react()],
  build: { outDir: "dist" },
});
