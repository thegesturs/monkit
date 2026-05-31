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
  /** Foundry project dir (contains foundry.toml + out/), relative to root. */
  readonly contractsDir: string;
}

const DEFAULTS: MonadConfig = {
  frontendDir: "frontend",
  contractsDir: "contracts",
};

const asNonEmptyString = (value: unknown, fallback: string): string =>
  typeof value === "string" && value !== "" ? value : fallback;

/** Read `<root>/monad.config.json`, falling back to defaults on any problem. */
export async function readMonadConfig(
  projectRoot: string,
): Promise<MonadConfig> {
  try {
    const raw = await readFile(join(projectRoot, "monad.config.json"), "utf8");
    const parsed = JSON.parse(raw) as {
      frontendDir?: unknown;
      contractsDir?: unknown;
    };
    return {
      frontendDir: asNonEmptyString(parsed.frontendDir, DEFAULTS.frontendDir),
      contractsDir: asNonEmptyString(
        parsed.contractsDir,
        DEFAULTS.contractsDir,
      ),
    };
  } catch {
    return DEFAULTS;
  }
}

/**
 * Resolve the Foundry root for a project — the dir `forge build` runs in and
 * whose `out/` holds the artifacts. The template nests Foundry under
 * `contracts/`, but flat layouts (foundry.toml at the project root) are also
 * supported. Resolution order: `<root>/<contractsDir>` if it has a
 * foundry.toml → `<root>` if it has one → `<root>/<contractsDir>` (the
 * template default, even if not built yet).
 */
export async function resolveContractsRoot(
  projectRoot: string,
): Promise<string> {
  const { contractsDir } = await readMonadConfig(projectRoot);
  const nested = join(projectRoot, contractsDir);
  const hasFoundryToml = async (dir: string): Promise<boolean> => {
    try {
      return (await stat(join(dir, "foundry.toml"))).isFile();
    } catch {
      return false;
    }
  };
  if (await hasFoundryToml(nested)) return nested;
  if (await hasFoundryToml(projectRoot)) return projectRoot;
  return nested;
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
