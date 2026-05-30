/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Local Convex backend URL, injected at scaffold time (Phase 7). */
  readonly VITE_CONVEX_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
