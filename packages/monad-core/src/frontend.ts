import { stat } from "node:fs/promises";
import { join } from "node:path";

export type PackageManager = "bun" | "pnpm" | "yarn" | "npm";

/** Lockfile → package manager, in preference order. First match wins. */
const LOCKFILES: readonly [string, PackageManager][] = [
  ["bun.lock", "bun"],
  ["bun.lockb", "bun"],
  ["pnpm-lock.yaml", "pnpm"],
  ["yarn.lock", "yarn"],
  ["package-lock.json", "npm"],
];

async function fileExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Detect the package manager that owns `dir` by its lockfile, defaulting to
 * bun (the repo + template standard) when none is present.
 */
export async function detectPackageManager(
  dir: string,
): Promise<PackageManager> {
  for (const [file, pm] of LOCKFILES) {
    if (await fileExists(join(dir, file))) return pm;
  }
  return "bun";
}

/**
 * Pull the first localhost dev-server URL out of a chunk of dev-server stdout.
 * Matches Vite's "Local:   http://localhost:5173/" line as well as plain URL
 * prints from other dev servers. The match scans the whole chunk, so ANSI
 * color codes Vite wraps the line in don't interfere. Returns null if none.
 */
export function parseDevServerUrl(output: string): string | null {
  const match = output.match(
    /https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?\/?/,
  );
  return match ? match[0].replace(/\/$/, "") : null;
}
