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
  /** Foundry project dir (contains foundry.toml), relative to root. */
  readonly contractsDir: string;
  /** Foundry artifact dir (the `out/`), relative to root. */
  readonly outDir: string;
}

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
      outDir?: unknown;
    };
    const contractsDir = asNonEmptyString(parsed.contractsDir, "contracts");
    return {
      frontendDir: asNonEmptyString(parsed.frontendDir, "frontend"),
      contractsDir,
      // outDir defaults to <contractsDir>/out — Foundry's default, relative to
      // the project root to match the config's root-relative convention.
      outDir: asNonEmptyString(parsed.outDir, join(contractsDir, "out")),
    };
  } catch {
    return {
      frontendDir: "frontend",
      contractsDir: "contracts",
      outDir: "contracts/out",
    };
  }
}

export interface ResolvedContracts {
  /** Absolute dir `forge build` runs in (holds foundry.toml). */
  readonly foundryRoot: string;
  /** Absolute dir the compiled artifacts live in. */
  readonly outDir: string;
}

const hasFoundryToml = async (dir: string): Promise<boolean> => {
  try {
    return (await stat(join(dir, "foundry.toml"))).isFile();
  } catch {
    return false;
  }
};

/**
 * Resolve where a project's contracts compile from + to, honouring
 * `monad.config.json` (`contractsDir` + `outDir`, both root-relative). The
 * template nests Foundry under `contracts/`; flat layouts (foundry.toml at the
 * project root) are also supported. Resolution: the config's `contractsDir` if
 * it has a foundry.toml → the project root if it has one (flat layout, `out/`
 * at root) → the config's dirs as the default even if not built yet.
 */
export async function resolveContracts(
  projectRoot: string,
): Promise<ResolvedContracts> {
  const { contractsDir, outDir } = await readMonadConfig(projectRoot);
  const nested = join(projectRoot, contractsDir);
  if (await hasFoundryToml(nested)) {
    return { foundryRoot: nested, outDir: join(projectRoot, outDir) };
  }
  if (await hasFoundryToml(projectRoot)) {
    return { foundryRoot: projectRoot, outDir: join(projectRoot, "out") };
  }
  return { foundryRoot: nested, outDir: join(projectRoot, outDir) };
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
