import { execFile } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import type { Abi, Hex } from "viem";

const execFileAsync = promisify(execFile);

export interface CompiledContract {
  readonly name: string;
  readonly abi: Abi;
  readonly bytecode: Hex;
  /** Solidity source path from the artifact metadata, e.g. "src/Counter.sol". */
  readonly sourcePath: string | null;
}

/**
 * Whether an artifact is one of the user's own deployable contracts (under
 * `src/`) vs a dependency, test, or script. Foundry compiles forge-std and
 * test/script contracts into `out/` too, and many carry creation bytecode —
 * we don't want them cluttering the deploy picker. `null` source (metadata
 * disabled) is kept, since we can't tell.
 */
function isDeployableSource(sourcePath: string | null): boolean {
  if (sourcePath === null) return true;
  const p = sourcePath.replace(/^\.?\//, "");
  if (p.startsWith("lib/") || p.includes("/lib/")) return false;
  if (p.startsWith("test/") || p.includes("/test/")) return false;
  if (p.startsWith("script/") || p.includes("/script/")) return false;
  if (/\.t\.sol$/.test(p) || /\.s\.sol$/.test(p)) return false;
  return true;
}

/** True if the Foundry `forge` binary is available on PATH. */
export async function hasFoundry(): Promise<boolean> {
  try {
    await execFileAsync("forge", ["--version"], { timeout: 10_000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Run `forge build` in the project root. Throws with forge's stderr on
 * compile failure so the caller can surface file:line diagnostics.
 */
export async function compileProject(projectRoot: string): Promise<void> {
  try {
    await execFileAsync("forge", ["build"], {
      cwd: projectRoot,
      timeout: 180_000,
      maxBuffer: 32 * 1024 * 1024,
    });
  } catch (err) {
    const e = err as { stderr?: string; stdout?: string; message?: string };
    const detail =
      e.stderr?.trim() || e.stdout?.trim() || e.message || String(err);
    throw new Error(detail);
  }
}

/**
 * List deployable contracts found in `out/` after a build — i.e. artifacts
 * that carry non-empty creation bytecode (skips interfaces/abstracts/libs).
 */
export async function listCompiledContracts(
  projectRoot: string,
): Promise<readonly CompiledContract[]> {
  const outDir = join(projectRoot, "out");
  const found: CompiledContract[] = [];

  let entries: string[];
  try {
    entries = await readdir(outDir);
  } catch {
    return []; // no out/ yet — caller should compile first
  }

  for (const dir of entries) {
    if (!dir.endsWith(".sol")) continue;
    let files: string[];
    try {
      files = await readdir(join(outDir, dir));
    } catch {
      continue;
    }
    for (const file of files) {
      if (!file.endsWith(".json")) continue;
      const parsed = await readArtifactFile(join(outDir, dir, file));
      if (parsed !== null && isDeployableSource(parsed.sourcePath)) {
        found.push(parsed);
      }
    }
  }

  // Stable, de-duplicated by name (first wins).
  const byName = new Map<string, CompiledContract>();
  for (const c of found) if (!byName.has(c.name)) byName.set(c.name, c);
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** Read + parse a single Foundry artifact for a named contract. */
export async function readArtifact(
  projectRoot: string,
  contractName: string,
): Promise<CompiledContract> {
  const path = join(
    projectRoot,
    "out",
    `${contractName}.sol`,
    `${contractName}.json`,
  );
  const parsed = await readArtifactFile(path);
  if (parsed === null) {
    throw new Error(
      `No deployable artifact for "${contractName}". Run a build and check the contract name.`,
    );
  }
  return parsed;
}

async function readArtifactFile(
  path: string,
): Promise<CompiledContract | null> {
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch {
    return null;
  }
  let json: {
    abi?: Abi;
    bytecode?: { object?: string };
    metadata?: { settings?: { compilationTarget?: Record<string, string> } };
  };
  try {
    json = JSON.parse(raw);
  } catch {
    return null;
  }
  const object = json.bytecode?.object;
  if (object == null || object === "0x" || object === "") return null;
  const bytecode = (object.startsWith("0x") ? object : `0x${object}`) as Hex;
  const name =
    path
      .split("/")
      .pop()
      ?.replace(/\.json$/, "") ?? "Contract";
  const target = json.metadata?.settings?.compilationTarget;
  const sourcePath = target ? (Object.keys(target)[0] ?? null) : null;
  return { name, abi: json.abi ?? [], bytecode, sourcePath };
}
