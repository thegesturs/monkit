import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";

/**
 * The slice of `monad.config.json` codegen + the dev-server runner care about.
 * Everything is optional on disk; we fill in template defaults so a missing or
 * partial config never blocks a deploy.
 */
export interface MonadConfig {
  /** Frontend package dir, relative to the project root. */
  readonly frontendDir: string;
}

const DEFAULTS: MonadConfig = {
  frontendDir: "frontend",
};

/** Read `<root>/monad.config.json`, falling back to defaults on any problem. */
export async function readMonadConfig(
  projectRoot: string,
): Promise<MonadConfig> {
  try {
    const raw = await readFile(join(projectRoot, "monad.config.json"), "utf8");
    const parsed = JSON.parse(raw) as { frontendDir?: unknown };
    return {
      frontendDir:
        typeof parsed.frontendDir === "string" && parsed.frontendDir !== ""
          ? parsed.frontendDir
          : DEFAULTS.frontendDir,
    };
  } catch {
    return DEFAULTS;
  }
}

export interface ResolvedFrontend {
  /** Absolute path to the frontend package (`<root>/<frontendDir>`). */
  readonly frontendDir: string;
  /** Absolute path to the generated-bindings dir (`<frontendDir>/src/contracts`). */
  readonly contractsDir: string;
  /** False when the frontend package isn't present — callers should no-op. */
  readonly exists: boolean;
}

/**
 * Resolve the frontend + generated-bindings dirs for a project, reporting
 * whether the frontend package actually exists (so codegen can no-op cleanly
 * for contract-only projects).
 */
export async function resolveFrontend(
  projectRoot: string,
): Promise<ResolvedFrontend> {
  const config = await readMonadConfig(projectRoot);
  const frontendDir = join(projectRoot, config.frontendDir);
  const contractsDir = join(frontendDir, "src", "contracts");
  let exists = false;
  try {
    exists = (await stat(frontendDir)).isDirectory();
  } catch {
    exists = false;
  }
  return { frontendDir, contractsDir, exists };
}
