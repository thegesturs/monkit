import { spawn } from "node:child_process";
import { appendFile, mkdir, readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { PackageManager } from "./frontend.js";

/** Strip ANSI color codes the CLIs wrap their output in. */
const ANSI_PATTERN = /\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g;

/**
 * Single debug log for every cloud command (deploy, build, login, status).
 * Appended unconditionally so we can diagnose failures from the actual CLI
 * output instead of guessing. Findable + pasteable by the user.
 */
export const CLOUD_LOG_FILE = join(homedir(), ".monkit", "cloud-deploy.log");

let logDirReady = false;
export async function cloudLog(message: string): Promise<void> {
  try {
    if (!logDirReady) {
      await mkdir(dirname(CLOUD_LOG_FILE), { recursive: true });
      logDirReady = true;
    }
    const ts = new Date().toISOString();
    await appendFile(CLOUD_LOG_FILE, `[${ts}] ${message}\n`);
  } catch {
    // logging must never break the flow
  }
}

/**
 * Cloud-deploy shell-outs: drive the Convex + Vercel CLIs to publish a
 * scaffolded full-stack dApp. Pure async I/O — the server layer (Effect) wraps
 * these. Auth is handled by the CLIs' own cached sessions (the user runs
 * `convex login` / `vercel login` once in a terminal); we store no tokens.
 *
 * Every command runs non-interactively (`CI=1`, stdin closed) so a CLI can
 * never block the orchestration waiting on a TTY prompt.
 */

/** A command exited non-zero; `output` carries the combined stdout+stderr. */
export class CloudCommandError extends Error {
  readonly output: string;
  readonly code: number | null;
  constructor(message: string, output: string, code: number | null) {
    super(message);
    this.name = "CloudCommandError";
    this.output = output;
    this.code = code;
  }
}

interface RunResult {
  readonly stdout: string;
  readonly stderr: string;
}

interface RunOptions {
  readonly cwd: string;
  readonly onLog?: (line: string) => void;
  readonly timeoutMs?: number;
  /** Treat a non-zero exit as success (for `--version` style probes). */
  readonly allowFailure?: boolean;
  /**
   * Set `CI=1` (default). Disable for the Convex CLI: in CI mode it ignores the
   * user's device login and demands a CONVEX_DEPLOY_KEY, so `convex dev` would
   * refuse even when the user is signed in.
   */
  readonly ci?: boolean;
}

/**
 * Spawn a command, stream its output line-wise to `onLog`, and resolve with the
 * captured stdout/stderr. Rejects with {@link CloudCommandError} on a non-zero
 * exit (unless `allowFailure`), on spawn error, or on timeout (the child is
 * killed). Runs with stdin closed; `CI=1` by default so nothing prompts.
 */
function runCommand(
  command: string,
  args: readonly string[],
  options: RunOptions,
): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const env =
      options.ci === false
        ? { ...process.env }
        : { ...process.env, CI: "1" };
    void cloudLog(
      `$ ${command} ${args.join(" ")}  (cwd=${options.cwd}, CI=${options.ci === false ? "0" : "1"})`,
    );
    const child = spawn(command, args as string[], {
      cwd: options.cwd,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let settled = false;

    const timeout =
      options.timeoutMs != null
        ? setTimeout(() => {
            if (settled) return;
            settled = true;
            child.kill("SIGKILL");
            reject(
              new CloudCommandError(
                `${command} timed out after ${options.timeoutMs}ms`,
                stdout + stderr,
                null,
              ),
            );
          }, options.timeoutMs)
        : null;

    const onChunk = (target: "out" | "err") => (buf: Buffer) => {
      const text = buf.toString();
      if (target === "out") stdout += text;
      else stderr += text;
      for (const line of text.split(/\r?\n/)) {
        const clean = line.replace(ANSI_PATTERN, "").trimEnd();
        if (clean.trim() === "") continue;
        void cloudLog(`  [${target}] ${clean}`);
        if (options.onLog) options.onLog(line);
      }
    };
    child.stdout?.on("data", onChunk("out"));
    child.stderr?.on("data", onChunk("err"));

    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      if (timeout) clearTimeout(timeout);
      void cloudLog(`! ${command} spawn error: ${err.message}`);
      reject(new CloudCommandError(err.message, stdout + stderr, null));
    });

    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      if (timeout) clearTimeout(timeout);
      void cloudLog(`= ${command} exited with code ${code}`);
      if (code === 0 || options.allowFailure) {
        resolve({ stdout, stderr });
      } else {
        reject(
          new CloudCommandError(
            `${command} exited with code ${code}`,
            stdout + stderr,
            code,
          ),
        );
      }
    });
  });
}

/**
 * The binary + leading args that run a locally-installed CLI through a given
 * package manager (e.g. bun → `bun x <cli>`, npm → `npx <cli>`).
 */
function pmRunner(pm: PackageManager, cli: string): [string, string[]] {
  switch (pm) {
    case "bun":
      return ["bun", ["x", cli]];
    case "pnpm":
      return ["pnpm", ["exec", cli]];
    case "yarn":
      return ["yarn", [cli]];
    case "npm":
      return ["npx", [cli]];
  }
}

/** Read a single `KEY=value` line out of `<frontendDir>/.env.local`. */
async function readEnvLocalVar(
  frontendDir: string,
  key: string,
): Promise<string | null> {
  try {
    const raw = await readFile(join(frontendDir, ".env.local"), "utf8");
    const match = raw.match(new RegExp(`^${key}=(.+)$`, "m"));
    const value = match?.[1];
    if (value == null) return null;
    return value.trim().replace(/^["']|["']$/g, "");
  } catch {
    return null;
  }
}

/**
 * True if the Convex CLI resolves in the frontend package. Convex is a project
 * dependency (not global), so probe through the package manager's runner.
 */
export async function hasConvexCli(
  frontendDir: string,
  pm: PackageManager,
): Promise<boolean> {
  const [bin, lead] = pmRunner(pm, "convex");
  try {
    await runCommand(bin, [...lead, "--version"], {
      cwd: frontendDir,
      timeoutMs: 30_000,
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Ensure the frontend's dependencies are installed. Scaffolded projects ship
 * without `node_modules`, so `convex dev` / the Vite build fail to resolve
 * packages (e.g. `convex/server`). Idempotent: skips when `convex` is already
 * present. Returns whether an install actually ran.
 */
export async function ensureFrontendDeps(opts: {
  readonly frontendDir: string;
  readonly pm: PackageManager;
  readonly onLog?: (line: string) => void;
  readonly timeoutMs?: number;
}): Promise<{ readonly installed: boolean }> {
  try {
    // `convex` resolving is our proxy for "deps are installed".
    await stat(join(opts.frontendDir, "node_modules", "convex"));
    return { installed: false };
  } catch {
    // not installed — fall through
  }
  await runCommand(opts.pm, ["install"], {
    cwd: opts.frontendDir,
    onLog: opts.onLog,
    timeoutMs: opts.timeoutMs ?? 300_000,
  });
  return { installed: true };
}

/** True if the Vercel CLI is on PATH (it's a global install). */
export async function hasVercelCli(): Promise<boolean> {
  try {
    await runCommand("vercel", ["--version"], {
      cwd: process.cwd(),
      timeoutMs: 30_000,
    });
    return true;
  } catch {
    return false;
  }
}

export interface ConvexDevResult {
  /** The Convex deployment URL (value of VITE_CONVEX_URL). */
  readonly url: string;
  /** True when recovered from `.env.local` rather than parsed from stdout. */
  readonly fromEnvFile: boolean;
}

/**
 * Push the project's Convex functions to its cloud **dev** deployment once and
 * exit (`convex dev --once`). On success Convex writes `VITE_CONVEX_URL` into
 * `<frontendDir>/.env.local` — that file is the source of truth for the URL.
 *
 * Throws {@link CloudCommandError} on failure; the message/output let callers
 * detect "not logged in" / "needs first-time setup".
 */
export async function convexDevOnce(opts: {
  readonly frontendDir: string;
  readonly pm: PackageManager;
  readonly onLog?: (line: string) => void;
  readonly timeoutMs?: number;
}): Promise<ConvexDevResult> {
  const [bin, lead] = pmRunner(opts.pm, "convex");
  const { stdout } = await runCommand(
    bin,
    [...lead, "dev", "--once"],
    {
      cwd: opts.frontendDir,
      onLog: opts.onLog,
      timeoutMs: opts.timeoutMs ?? 180_000,
      // Must NOT run in CI mode — that ignores the user's device login and
      // demands a deploy key. We want it to use the signed-in account and
      // provision a cloud dev deployment.
      ci: false,
    },
  );

  // The env file Convex writes is authoritative; stdout format drifts.
  const fromEnv = await readEnvLocalVar(opts.frontendDir, "VITE_CONVEX_URL");
  if (fromEnv) return { url: fromEnv, fromEnvFile: true };

  const fromStdout = stdout.match(/https:\/\/[a-z0-9-]+\.convex\.cloud/);
  if (fromStdout) return { url: fromStdout[0], fromEnvFile: false };

  throw new CloudCommandError(
    "Convex deployed but no VITE_CONVEX_URL was found in .env.local",
    stdout,
    0,
  );
}

/**
 * Run the frontend's `build` script. Vite statically inlines
 * `import.meta.env.VITE_CONVEX_URL` from `.env.local` (written by Convex) and
 * the generated contract addresses at build time, so this must run AFTER
 * {@link convexDevOnce} and the contract deploy. Returns the `dist/` dir.
 */
export async function buildFrontend(opts: {
  readonly frontendDir: string;
  readonly pm: PackageManager;
  readonly onLog?: (line: string) => void;
  readonly timeoutMs?: number;
}): Promise<{ readonly distDir: string }> {
  await runCommand(opts.pm, ["run", "build"], {
    cwd: opts.frontendDir,
    onLog: opts.onLog,
    timeoutMs: opts.timeoutMs ?? 240_000,
  });
  return { distDir: join(opts.frontendDir, "dist") };
}

/** Pull the last `*.vercel.app` URL out of Vercel CLI output. */
export function parseVercelUrl(output: string): string | null {
  const matches = output.match(/https:\/\/[a-z0-9-]+\.vercel\.app/g);
  return matches && matches.length > 0
    ? (matches[matches.length - 1] ?? null)
    : null;
}

/**
 * Resolve the clean PUBLIC production domain (`<project>.vercel.app`) for a
 * deployment. The URL `vercel deploy` prints to stdout is the deployment-
 * specific URL (`<project>-<hash>-<scope>.vercel.app`), which Vercel's default
 * "Standard Protection" can gate behind auth. Production domains are public, so
 * we read the deployment's aliases via `vercel inspect` and pick the shortest
 * `*.vercel.app` (the bare `<project>.vercel.app`). Falls back to the
 * deployment URL if inspect yields nothing.
 */
export async function vercelProductionUrl(opts: {
  readonly deploymentUrl: string;
  readonly cwd: string;
  readonly onLog?: (line: string) => void;
}): Promise<string> {
  try {
    const { stdout, stderr } = await runCommand(
      "vercel",
      ["inspect", opts.deploymentUrl],
      { cwd: opts.cwd, onLog: opts.onLog, timeoutMs: 60_000, allowFailure: true },
    );
    const all = `${stdout}\n${stderr}`.match(
      /https:\/\/[a-z0-9-]+\.vercel\.app/gi,
    );
    const aliases = (all ?? []).filter((u) => u !== opts.deploymentUrl);
    if (aliases.length === 0) return opts.deploymentUrl;
    // The bare production domain has the shortest hostname (no hash/scope).
    return aliases.sort((a, b) => a.length - b.length)[0] ?? opts.deploymentUrl;
  } catch {
    return opts.deploymentUrl;
  }
}

/**
 * Deploy a prebuilt static `dist/` to Vercel production. Because the directory
 * is plain static files, Vercel runs no build — so no Vercel-side env vars are
 * needed (the Convex URL + addresses are already baked into the bundle).
 * `--yes` accepts defaults for a brand-new/unlinked project. Returns both the
 * public production `url` (shareable) and the raw `deploymentUrl`. Throws
 * {@link CloudCommandError} on failure (incl. "not logged in").
 */
export async function vercelDeployStatic(opts: {
  readonly distDir: string;
  readonly onLog?: (line: string) => void;
  readonly timeoutMs?: number;
}): Promise<{ readonly url: string; readonly deploymentUrl: string }> {
  const { stdout, stderr } = await runCommand(
    "vercel",
    ["deploy", "--prod", "--yes"],
    {
      cwd: opts.distDir,
      onLog: opts.onLog,
      timeoutMs: opts.timeoutMs ?? 240_000,
    },
  );
  const deploymentUrl =
    parseVercelUrl(stdout) ?? parseVercelUrl(stdout + stderr);
  if (!deploymentUrl) {
    throw new CloudCommandError(
      "Vercel deploy finished but no *.vercel.app URL was found in its output",
      stdout + stderr,
      0,
    );
  }
  const url = await vercelProductionUrl({
    deploymentUrl,
    cwd: opts.distDir,
    onLog: opts.onLog,
  });
  return { url, deploymentUrl };
}

// ===== Auth: in-app device-flow login (no terminal) =====

/** True when a Convex access token is already stored at ~/.convex/config.json. */
export async function convexConnected(): Promise<boolean> {
  try {
    const raw = await readFile(join(homedir(), ".convex", "config.json"), "utf8");
    const parsed = JSON.parse(raw) as { accessToken?: unknown };
    return typeof parsed.accessToken === "string" && parsed.accessToken !== "";
  } catch {
    return false;
  }
}

/** True when the Vercel CLI has stored credentials (`vercel whoami` succeeds). */
export async function vercelConnected(): Promise<boolean> {
  try {
    await runCommand("vercel", ["whoami"], {
      cwd: homedir(),
      timeoutMs: 20_000,
    });
    return true;
  } catch {
    return false;
  }
}

interface LoginOptions {
  readonly onUrl?: (url: string) => void;
  readonly onLog?: (line: string) => void;
  readonly signal?: AbortSignal;
}

/**
 * Spawn a CLI's OAuth device-flow login, surface the first auth URL it prints
 * via `onUrl` (so the app can open it in the browser), and resolve when the CLI
 * exits 0 (the user approved). Rejects on non-zero exit / spawn error / abort.
 * No `CI` env and no timeout — the user needs time to approve in the browser;
 * cancellation comes via `signal` (kills the child).
 */
function spawnLoginFlow(opts: {
  readonly command: string;
  readonly args: readonly string[];
  readonly cwd: string;
  readonly urlPattern: RegExp;
  readonly onUrl?: (url: string) => void;
  readonly onLog?: (line: string) => void;
  readonly signal?: AbortSignal;
}): Promise<void> {
  return new Promise((resolve, reject) => {
    if (opts.signal?.aborted) {
      reject(new CloudCommandError("Login cancelled", "", null));
      return;
    }
    void cloudLog(
      `$ (login) ${opts.command} ${opts.args.join(" ")}  (cwd=${opts.cwd})`,
    );
    const child = spawn(opts.command, opts.args as string[], {
      cwd: opts.cwd,
      env: { ...process.env },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let output = "";
    let urlEmitted = false;
    let settled = false;

    const onAbort = () => {
      if (settled) return;
      settled = true;
      child.kill("SIGTERM");
      reject(new CloudCommandError("Login cancelled", output, null));
    };
    opts.signal?.addEventListener("abort", onAbort, { once: true });
    const cleanup = () => opts.signal?.removeEventListener("abort", onAbort);

    const onChunk = (buf: Buffer) => {
      const text = buf.toString();
      output += text;
      for (const line of text.split(/\r?\n/)) {
        const clean = line.replace(ANSI_PATTERN, "").trim();
        if (clean === "") continue;
        void cloudLog(`  [login] ${clean}`);
        opts.onLog?.(clean);
        if (!urlEmitted) {
          const match = clean.match(opts.urlPattern);
          if (match) {
            urlEmitted = true;
            // Strip trailing punctuation the CLI may print after the URL.
            const url = match[0].replace(/[.,)\]]+$/, "");
            void cloudLog(`  [login] detected auth URL: ${url}`);
            opts.onUrl?.(url);
          }
        }
      }
    };
    child.stdout?.on("data", onChunk);
    child.stderr?.on("data", onChunk);

    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      cleanup();
      void cloudLog(`! (login) ${opts.command} spawn error: ${err.message}`);
      reject(new CloudCommandError(err.message, output, null));
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      cleanup();
      void cloudLog(`= (login) ${opts.command} exited with code ${code}`);
      if (code === 0) resolve();
      else {
        // Surface the CLI's actual output — without it a bare "exited with
        // code 1" is undebuggable (bad flag? no TTY? not installed?).
        const tail = output
          .split(/\r?\n/)
          .map((l) => l.replace(ANSI_PATTERN, "").trim())
          .filter((l) => l !== "")
          .slice(-12)
          .join("\n");
        reject(
          new CloudCommandError(
            tail !== ""
              ? `Login failed (exit ${code}):\n${tail}`
              : `Login exited with code ${code}`,
            output,
            code,
          ),
        );
      }
    });
  });
}

// The auth URL a login flow prints can be on any host (Convex routes through
// WorkOS/AuthKit), so match the first URL on a line rather than a fixed host.
const ANY_URL_PATTERN = /https?:\/\/\S+/i;

/**
 * Convex device-flow login. `--no-open` stops the CLI from opening its own tab;
 * the app opens the URL surfaced via `onUrl` (and shows it as a clickable
 * fallback). On success the token lands in ~/.convex/config.json.
 */
export async function convexLogin(
  opts: { readonly frontendDir: string; readonly pm: PackageManager } & LoginOptions,
): Promise<void> {
  const [bin, lead] = pmRunner(opts.pm, "convex");
  await spawnLoginFlow({
    command: bin,
    args: [...lead, "login", "--no-open", "--device-name", "Monkit"],
    cwd: opts.frontendDir,
    urlPattern: ANY_URL_PATTERN,
    onUrl: opts.onUrl,
    onLog: opts.onLog,
    signal: opts.signal,
  });
}

/** Vercel device-flow login (default since 2025). Stores its own credentials. */
export async function vercelLogin(opts: LoginOptions): Promise<void> {
  await spawnLoginFlow({
    command: "vercel",
    args: ["login"],
    cwd: homedir(),
    urlPattern: ANY_URL_PATTERN,
    onUrl: opts.onUrl,
    onLog: opts.onLog,
    signal: opts.signal,
  });
}
