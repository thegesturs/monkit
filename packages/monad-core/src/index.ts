/**
 * @memoize/monad-core
 *
 * Transport-agnostic Monad development services (viem RPC, networks, later: wallet, compile, deploy, devnet, explorer, publish).
 * Follows the exact package-as-library pattern of @memoize/index (ADR 0013).
 *
 * Phase 1 exports the minimal RPC + network surface needed for live block height.
 */

// Public service surface (to be expanded in later phases)
export * from "./api.js";
export * from "./networks.js";
export * from "./rpc.js";
export * from "./wallet.js";
export * from "./devnet.js";
export * from "./compile.js";
export * from "./deploy.js";
export * from "./interact.js";
export * from "./codegen.js";
export * from "./config.js";
export * from "./frontend.js";
export * from "./cloud.js";

// Branded IDs + errors + network primitives
export * from "./schema.js";
export type { NetworkId, NetworkConfig } from "./networks.js";
