import { URL, fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Static build so the dApp can be published to IPFS / any static host.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // Mirror tsconfig's `@convex/*` so Vite resolves Convex's generated API
      // (e.g. `import { api } from "@convex/_generated/api"`).
      "@convex": fileURLToPath(new URL("./convex", import.meta.url)),
    },
  },
  build: { outDir: "dist" },
});
