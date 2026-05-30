/* Placeholder for Convex codegen.
 *
 * `convex dev` / `convex codegen` regenerates this directory with fully-typed
 * function references. Re-exporting `anyApi` keeps the frontend building and
 * running (queries resolve by name) before the backend is provisioned (Phase 7).
 */
import { anyApi } from "convex/server";

export const api = anyApi;
export const internal = anyApi;
