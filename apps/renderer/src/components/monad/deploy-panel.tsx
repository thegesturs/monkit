import { Effect, Stream } from "effect";
import {
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  FileCode2,
  Fuel,
  Globe,
  Hammer,
  Link as LinkIcon,
  Loader2,
  Play,
  RefreshCw,
  Rocket,
  Server,
  Square,
  SquareTerminal,
  TriangleAlert,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import type {
  CompiledContractInfo,
  DeployRecord,
  NetworkId,
} from "@memoize/wire";

import { getRpcClient } from "../../lib/rpc-client.ts";
import { useActiveContext } from "../../store/active-workspace.ts";
import { useMonadStore } from "../../store/monad.ts";
import { terminalsKey, useTerminalsStore } from "../../store/terminals.ts";
import { useUiStore } from "../../store/ui.ts";
import { Button } from "../ui/button.tsx";
import { toastManager } from "../ui/toast.tsx";
import {
  Empty,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
} from "../ui/empty.tsx";
import {
  NETWORK_META,
  explorerAddressUrl,
  explorerTxUrl,
  openExternal,
  truncateAddress,
} from "./lib/format.ts";

type CompileState =
  | { kind: "idle" }
  | { kind: "compiling" }
  | { kind: "ready"; contracts: readonly CompiledContractInfo[] }
  | { kind: "no-foundry" }
  | { kind: "error"; message: string };

/** The three stages a user toggles. `publish` = build + Vercel together. */
type Stage = "contract" | "convex" | "publish";
type StepStatus = "pending" | "active" | "done" | "failed";

const STAGE_META: Record<Stage, { label: string; hint: string }> = {
  contract: { label: "Deploy contract", hint: "to Monad testnet" },
  convex: { label: "Convex backend", hint: "database + auth" },
  publish: { label: "Publish frontend", hint: "build + deploy to Vercel" },
};

interface Stages {
  contract: boolean;
  convex: boolean;
  publish: boolean;
}

interface CloudState {
  running: boolean;
  steps: Record<Stage, StepStatus>;
  shareUrl: string | null;
  contractAddress: string | null;
  logTail: readonly string[];
  error: string | null;
}

const IDLE_CLOUD: CloudState = {
  running: false,
  steps: { contract: "pending", convex: "pending", publish: "pending" },
  shareUrl: null,
  contractAddress: null,
  logTail: [],
  error: null,
};

/** Map a server-side stage event onto the UI's three stages (build+vercel → publish). */
function toUiStage(
  stage: "deploy-contract" | "convex" | "build" | "vercel" | "done",
): Stage | null {
  if (stage === "deploy-contract") return "contract";
  if (stage === "convex") return "convex";
  if (stage === "build" || stage === "vercel") return "publish";
  return null;
}

export function DeployPanel({
  projectId,
}: {
  projectId: string;
}): React.ReactElement {
  const network = useMonadStore((s) => s.activeNetwork);
  const setActiveNetwork = useMonadStore((s) => s.setActiveNetwork);
  const openInBrowser = useUiStore((s) => s.openInBrowser);
  const revealPanel = useUiStore((s) => s.revealPanel);
  const ctx = useActiveContext();
  const addCommandTerminal = useTerminalsStore((s) => s.addCommand);

  const [compile, setCompile] = useState<CompileState>({ kind: "idle" });
  const [selected, setSelected] = useState<string | null>(null);
  const [args, setArgs] = useState<Record<number, string>>({});
  const [deploying, setDeploying] = useState(false);
  const [deployError, setDeployError] = useState<string | null>(null);
  const [deploys, setDeploys] = useState<readonly DeployRecord[]>([]);
  const [devnetRunning, setDevnetRunning] = useState(false);
  const [devnetBusy, setDevnetBusy] = useState(false);
  const [frontend, setFrontend] = useState<{
    running: boolean;
    url: string | null;
    pm: string | null;
  }>({ running: false, url: null, pm: null });
  const [frontendBusy, setFrontendBusy] = useState(false);
  const [codegenBusy, setCodegenBusy] = useState(false);
  const [cloud, setCloud] = useState<CloudState>(IDLE_CLOUD);
  const [stages, setStages] = useState<Stages>({
    contract: true,
    convex: true,
    publish: true,
  });
  const [connections, setConnections] = useState<{
    convex: boolean;
    vercel: boolean;
  }>({ convex: false, vercel: false });
  const [connecting, setConnecting] = useState<{
    convex: boolean;
    vercel: boolean;
  }>({ convex: false, vercel: false });
  const [connect, setConnect] = useState<{
    service: "convex" | "vercel";
    url: string | null;
    status: "connecting" | "done" | "error";
    message: string | null;
    logs: readonly string[];
  } | null>(null);
  const [published, setPublished] = useState<{
    url: string;
    updatedAt: string;
  } | null>(null);

  const loadHistory = useCallback(async () => {
    try {
      const client = await getRpcClient();
      const list = await Effect.runPromise(
        client.monad["deploy.list"]({ projectId }),
      );
      setDeploys(list);
    } catch {
      // history is best-effort
    }
  }, [projectId]);

  const refreshDevnet = useCallback(async () => {
    try {
      const client = await getRpcClient();
      const status = await Effect.runPromise(client.monad["devnet.status"]({}));
      setDevnetRunning(status.running);
    } catch {
      setDevnetRunning(false);
    }
  }, []);

  const refreshFrontend = useCallback(async () => {
    try {
      const client = await getRpcClient();
      const status = await Effect.runPromise(
        client.monad["frontend.status"]({}),
      );
      setFrontend({ running: status.running, url: status.url, pm: status.pm });
    } catch {
      setFrontend({ running: false, url: null, pm: null });
    }
  }, []);

  const refreshConnections = useCallback(async () => {
    try {
      const client = await getRpcClient();
      const status = await Effect.runPromise(
        client.monad["cloud.status"]({}),
      );
      setConnections({ convex: status.convex, vercel: status.vercel });
    } catch {
      // best-effort — chips just show "Connect" until known
    }
  }, []);

  const refreshPublished = useCallback(async () => {
    try {
      const client = await getRpcClient();
      const p = await Effect.runPromise(
        client.monad["publishedUrl"]({ projectId }),
      );
      setPublished(p === null ? null : { url: p.url, updatedAt: p.updatedAt });
    } catch {
      // best-effort
    }
  }, [projectId]);

  useEffect(() => {
    void loadHistory();
    void refreshDevnet();
    void refreshFrontend();
    void refreshConnections();
    void refreshPublished();
  }, [
    loadHistory,
    refreshDevnet,
    refreshFrontend,
    refreshConnections,
    refreshPublished,
  ]);

  const connectService = (service: "convex" | "vercel") => {
    if (connecting[service]) return;
    setConnecting((c) => ({ ...c, [service]: true }));
    setConnect({
      service,
      url: null,
      status: "connecting",
      message: null,
      logs: [],
    });
    void (async () => {
      const client = await getRpcClient();
      const stream =
        service === "convex"
          ? client.monad["cloud.connectConvex"]({ projectId })
          : client.monad["cloud.connectVercel"]({});
      let sawUrl = false;
      const program = Stream.runForEach(
        stream.pipe(
          Stream.catchAll((err) => {
            setConnecting((c) => ({ ...c, [service]: false }));
            setConnections((c) => ({ ...c, [service]: false }));
            setConnect((s) => ({
              service,
              url: null,
              status: "error",
              message: err instanceof Error ? err.message : String(err),
              logs: s?.service === service ? s.logs : [],
            }));
            return Stream.empty;
          }),
        ),
        (ev) =>
          Effect.sync(() => {
            if (ev.type === "log" && ev.log !== null) {
              setConnect((s) =>
                s && s.service === service
                  ? { ...s, logs: [...s.logs, ev.log as string].slice(-40) }
                  : s,
              );
            }
            if (ev.type === "url" && ev.url !== null) {
              sawUrl = true;
              openExternal(ev.url);
              setConnect((s) =>
                s && s.service === service ? { ...s, url: ev.url } : s,
              );
            }
            if (ev.type === "done") {
              setConnecting((c) => ({ ...c, [service]: false }));
              setConnect((s) => ({
                service,
                url: null,
                status: ev.ok ? "done" : "error",
                message: ev.ok
                  ? sawUrl
                    ? null
                    : "Already signed in."
                  : (ev.log ?? "Sign-in failed."),
                logs: s?.service === service ? s.logs : [],
              }));
              if (ev.ok) void refreshConnections();
              else setConnections((c) => ({ ...c, [service]: false }));
            }
          }),
      );
      Effect.runFork(program);
    })();
  };

  // Convex's first-time CLOUD setup is interactive by design (it prompts to
  // pick a team / link an existing deployment), which a non-interactive spawn
  // can't answer. So we run it once in the app's own terminal where the user
  // can complete the prompt; every Ship afterward is non-interactive.
  const setupConvex = () => {
    if (ctx.status !== "ready") return;
    const key = terminalsKey(ctx.folderId, ctx.worktreeId);
    // `--configure` forces Convex to re-run setup (choose team + a CLOUD dev
    // deployment) — a plain `convex dev` silently reuses whatever deployment
    // is already selected (e.g. the local/anonymous one), which is why setup
    // appeared to do nothing. Run interactively so the user answers prompts.
    addCommandTerminal(key, ctx.rootPath, "Convex setup", {
      cmd: "bash",
      args: [
        "-lc",
        "cd frontend && bun install && bunx convex dev --configure --once || (echo; echo '--- setup exited; press enter to close ---'; read _)",
      ],
    });
    revealPanel("terminal");
  };

  const startFrontend = async () => {
    setFrontendBusy(true);
    try {
      const client = await getRpcClient();
      const status = await Effect.runPromise(
        client.monad["frontend.start"]({ projectId }),
      );
      setFrontend({ running: status.running, url: status.url, pm: status.pm });
      if (status.url !== null) {
        openInBrowser(status.url);
      } else {
        toastManager.add({
          title: "Frontend starting",
          description: "Waiting for the dev server to report its URL…",
        });
      }
    } catch (err) {
      toastManager.add({
        title: "Couldn’t start the frontend",
        description: err instanceof Error ? err.message : String(err),
        type: "error",
      });
    } finally {
      setFrontendBusy(false);
    }
  };

  const stopFrontend = async () => {
    setFrontendBusy(true);
    try {
      const client = await getRpcClient();
      await Effect.runPromise(client.monad["frontend.stop"]({}));
      setFrontend({ running: false, url: null, pm: null });
    } catch {
      await refreshFrontend();
    } finally {
      setFrontendBusy(false);
    }
  };

  const regenerateBindings = async () => {
    setCodegenBusy(true);
    try {
      const client = await getRpcClient();
      const res = await Effect.runPromise(
        client.monad["codegen"]({ projectId }),
      );
      if (res.frontendMissing) {
        toastManager.add({
          title: "No frontend to wire",
          description: "This project has no frontend package.",
        });
      } else {
        const parts: string[] = [];
        if (res.written.length > 0)
          parts.push(`updated ${res.written.join(", ")}`);
        if (res.skipped.length > 0)
          parts.push(`skipped ${res.skipped.join(", ")} (hand-edited)`);
        toastManager.add({
          title: "Bindings regenerated",
          description: parts.join(" · ") || "Nothing to write yet.",
          type: "success",
        });
      }
    } catch (err) {
      toastManager.add({
        title: "Couldn’t regenerate bindings",
        description: err instanceof Error ? err.message : String(err),
        type: "error",
      });
    } finally {
      setCodegenBusy(false);
    }
  };

  const runCompile = useCallback(async () => {
    setCompile({ kind: "compiling" });
    setArgs({});
    try {
      const client = await getRpcClient();
      const res = await Effect.runPromise(
        client.monad["deploy.compile"]({ projectId }),
      );
      if (!res.foundryAvailable) {
        setCompile({ kind: "no-foundry" });
        return;
      }
      setCompile({ kind: "ready", contracts: res.contracts });
      // Auto-select so the Deploy button is immediately actionable; keep the
      // current pick if it still exists after a recompile.
      setSelected((prev) =>
        prev !== null && res.contracts.some((c) => c.name === prev)
          ? prev
          : (res.contracts[0]?.name ?? null),
      );
    } catch (err) {
      setCompile({
        kind: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }, [projectId]);

  // Auto-compile when the panel opens (and when switching projects) so the
  // user sees their contracts without having to discover the Compile button.
  useEffect(() => {
    void runCompile();
  }, [runCompile]);

  const startDevnet = async () => {
    setDevnetBusy(true);
    try {
      const client = await getRpcClient();
      await Effect.runPromise(client.monad["devnet.start"]({}));
      await refreshDevnet();
    } catch {
      await refreshDevnet();
    } finally {
      setDevnetBusy(false);
    }
  };

  const selectedContract =
    compile.kind === "ready"
      ? (compile.contracts.find((c) => c.name === selected) ?? null)
      : null;

  // The testnet address this contract is already live at, if any — lets us
  // default the "Deploy contract" stage off so a frontend-only change ships
  // without redeploying the chain.
  const alreadyLive =
    deploys.find(
      (d) => d.network === "testnet" && d.contractName === selected,
    )?.address ?? null;

  // When the selected contract is already deployed, default its stage off.
  useEffect(() => {
    setStages((s) => ({ ...s, contract: alreadyLive === null }));
  }, [selected, alreadyLive]);

  const runDeploy = async () => {
    if (selectedContract === null) return;
    setDeploying(true);
    setDeployError(null);
    try {
      const client = await getRpcClient();
      const constructorArgs = selectedContract.constructorInputs.map(
        (_, i) => args[i] ?? "",
      );
      await Effect.runPromise(
        client.monad["deploy.contract"]({
          projectId,
          contractName: selectedContract.name,
          constructorArgs,
          network,
        }),
      );
      await loadHistory();
    } catch (err) {
      setDeployError(err instanceof Error ? err.message : String(err));
    } finally {
      setDeploying(false);
    }
  };

  const runCloudDeploy = async () => {
    if (selectedContract === null || cloud.running) return;
    if (!stages.contract && !stages.convex && !stages.publish) return;
    setCloud({ ...IDLE_CLOUD, running: true });
    const constructorArgs = selectedContract.constructorInputs.map(
      (_, i) => args[i] ?? "",
    );
    const client = await getRpcClient();
    const program = Stream.runForEach(
      client.monad
        .cloudDeploy({
          projectId,
          contractName: selectedContract.name,
          constructorArgs,
          stages,
        })
        .pipe(
          Stream.catchAll((err) => {
            setCloud((c) => ({
              ...c,
              running: false,
              error:
                c.error ?? (err instanceof Error ? err.message : String(err)),
            }));
            return Stream.empty;
          }),
        ),
      (ev) =>
        Effect.sync(() => {
          setCloud((c) => {
            const steps = { ...c.steps };
            const ui = toUiStage(ev.stage);
            if (ui !== null) {
              if (ev.status === "failed") steps[ui] = "failed";
              else if (ev.status === "started") steps[ui] = "active";
              else if (ev.status === "succeeded")
                // build succeeding just means Vercel is next — keep publishing.
                steps[ui] = ev.stage === "build" ? "active" : "done";
            }
            const logTail =
              ev.log !== null ? [...c.logTail, ev.log].slice(-40) : c.logTail;
            return {
              ...c,
              steps,
              logTail,
              shareUrl: ev.stage === "done" ? ev.shareUrl : c.shareUrl,
              contractAddress:
                ev.stage === "done" ? ev.contractAddress : c.contractAddress,
              error: ev.status === "failed" ? (ev.log ?? c.error) : c.error,
              running:
                ev.stage === "done" || ev.status === "failed"
                  ? false
                  : c.running,
            };
          });
          if (ev.stage === "done") {
            void loadHistory();
            void refreshPublished();
          }
        }),
    );
    Effect.runFork(program);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="flex flex-col gap-3 p-3">
        {/* Live app — the saved public share link (persists across reloads) */}
        {published !== null ? (
          <PublishedCard
            url={published.url}
            onOpen={(url) => openInBrowser(url)}
            onOpenExternal={(url) => openExternal(url)}
          />
        ) : null}

        {/* 1 — Contract: compile + pick + constructor args */}
        <Card>
          <CardHeader title="Contract">
            <Button
              size="xs"
              variant="outline"
              loading={compile.kind === "compiling"}
              onClick={() => void runCompile()}
            >
              <Hammer />
              {compile.kind === "ready" ? "Recompile" : "Compile"}
            </Button>
          </CardHeader>

          {compile.kind === "no-foundry" ? (
            <FoundryBanner />
          ) : compile.kind === "error" ? (
            <MonadErrorCard
              message={compile.message}
              network={network}
              context="compile"
              onSwitchNetwork={(id) => void setActiveNetwork(id)}
            />
          ) : compile.kind === "ready" ? (
            compile.contracts.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No deployable contract found in <code>contracts/src/</code>.
                Write a Solidity contract and it’ll show up here.
              </p>
            ) : (
              <>
                <div className="flex flex-wrap gap-1.5">
                  {compile.contracts.map((c) => (
                    <button
                      key={c.name}
                      type="button"
                      onClick={() => setSelected(c.name)}
                      className={
                        c.name === selected
                          ? "flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-[11px] font-medium text-primary-foreground"
                          : "flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      }
                    >
                      <FileCode2 className="size-3" />
                      {c.name}
                    </button>
                  ))}
                </div>

                {selectedContract &&
                selectedContract.constructorInputs.length > 0 ? (
                  <div className="mt-1 flex flex-col gap-2">
                    {selectedContract.constructorInputs.map((input, i) => (
                      <label key={i} className="flex flex-col gap-1">
                        <span className="font-mono text-[11px] text-muted-foreground">
                          {input.name}{" "}
                          <span className="opacity-60">{input.type}</span>
                        </span>
                        <input
                          value={args[i] ?? ""}
                          onChange={(e) =>
                            setArgs((prev) => ({
                              ...prev,
                              [i]: e.target.value,
                            }))
                          }
                          placeholder={input.type}
                          className="w-full rounded-lg border border-input bg-background px-2.5 py-1.5 font-mono text-xs text-foreground outline-none ring-ring/24 transition-shadow placeholder:text-muted-foreground/60 focus-visible:border-ring focus-visible:ring-[3px]"
                        />
                      </label>
                    ))}
                  </div>
                ) : null}
              </>
            )
          ) : (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" />
              Looking for contracts…
            </div>
          )}
        </Card>

        {/* 2 — Deploy: cloud ship on testnet, plain on-chain deploy otherwise */}
        {selectedContract ? (
          network === "testnet" ? (
            <ShipCard
              contract={selectedContract.name}
              cloud={cloud}
              stages={stages}
              alreadyLive={alreadyLive}
              connections={connections}
              connecting={connecting}
              connect={connect}
              onConnect={connectService}
              onOpenAuthUrl={(url) => openExternal(url)}
              onSetupConvex={setupConvex}
              onToggle={(stage) =>
                setStages((s) => ({ ...s, [stage]: !s[stage] }))
              }
              onRun={() => void runCloudDeploy()}
              onOpen={(url) => openInBrowser(url)}
            />
          ) : (
            <PlainDeployCard
              contract={selectedContract.name}
              network={network}
              deploying={deploying}
              error={deployError}
              onDeploy={() => void runDeploy()}
              onSwitchNetwork={(id) => void setActiveNetwork(id)}
              onSwitchTestnet={() => void setActiveNetwork("testnet")}
            />
          )
        ) : null}

        {/* 3 — Frontend dev server + bindings */}
        <FrontendCard
          frontend={frontend}
          busy={frontendBusy}
          bindingsBusy={codegenBusy}
          onRun={() => void startFrontend()}
          onStop={() => void stopFrontend()}
          onOpen={(url) => openInBrowser(url)}
          onBindings={() => void regenerateBindings()}
        />

        {/* 4 — Local devnet (local network only) */}
        {network === "local" ? (
          <DevnetCard
            running={devnetRunning}
            busy={devnetBusy}
            onStart={() => void startDevnet()}
          />
        ) : null}

        {/* 5 — Deploy history */}
        {deploys.length > 0 ? (
          <Card>
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              History
            </span>
            <div className="flex flex-col gap-1.5">
              {deploys.map((d) => (
                <DeployRow key={d.id} deploy={d} />
              ))}
            </div>
          </Card>
        ) : compile.kind === "ready" && compile.contracts.length === 0 ? (
          <Empty className="py-8">
            <EmptyMedia variant="icon">
              <FileCode2 />
            </EmptyMedia>
            <EmptyTitle>No contracts yet</EmptyTitle>
            <EmptyDescription>
              Add a Solidity contract under <code>contracts/src/</code> and it
              will appear here, ready to deploy.
            </EmptyDescription>
          </Empty>
        ) : null}
      </div>
    </div>
  );
}

/** A consistent panel card — every section in the Deploy panel uses this. */
function Card({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <div className="flex flex-col gap-2.5 rounded-xl border border-border bg-card p-3">
      {children}
    </div>
  );
}

/** Card header row: an uppercase label on the left, optional action on the right. */
function CardHeader({
  title,
  children,
}: {
  title: string;
  children?: React.ReactNode;
}): React.ReactElement {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </span>
      {children}
    </div>
  );
}

/**
 * The signer/`from` address in an error, if any. The negative lookahead keeps
 * us from matching a 40-hex slice inside a longer hex blob (e.g. the raw tx or
 * contract bytecode the RPC echoes back) — only a real, bounded address wins.
 */
function extractAddress(message: string): string | null {
  const m = message.match(/0x[0-9a-fA-F]{40}(?![0-9a-fA-F])/);
  return m ? m[0] : null;
}

/**
 * A compile/deploy failure shown as a clean, human-readable card instead of a
 * raw RPC dump: a one-line cause, a call-to-action where one exists (fund the
 * wallet, switch network), and the full message tucked behind "Details".
 */
function MonadErrorCard({
  message,
  network,
  context,
  onSwitchNetwork,
}: {
  message: string;
  network: NetworkId;
  context: "deploy" | "compile";
  onSwitchNetwork: (id: NetworkId) => void;
}): React.ReactElement {
  const lower = message.toLowerCase();
  const isFunds =
    /insufficient (balance|funds)|had insufficient|insufficient funds for gas/.test(
      lower,
    );
  const isBuild =
    context === "compile" ||
    /compiler run failed|error \(\d+\)|\bsolc\b|\s-->\s/.test(lower);

  // Out-of-gas — the most common deploy failure. Point the user at funds.
  if (isFunds) {
    const faucetUrl = NETWORK_META[network].faucetUrl;
    const addr = extractAddress(message);
    return (
      <div className="flex flex-col gap-3 rounded-lg border border-warning/30 bg-warning/[0.06] p-3.5">
        <div className="flex items-center gap-2 font-medium text-sm text-foreground">
          <Fuel className="size-4 shrink-0 text-warning" />
          Not enough gas to deploy
        </div>
        <p className="text-xs leading-relaxed text-muted-foreground">
          {/needs about/i.test(message)
            ? // Our preflight message already has the exact numbers — show it.
              message.replace(/\s*0x[0-9a-fA-F]{40}\s*/, " your app wallet ")
            : faucetUrl !== null
              ? "Your app wallet doesn’t have enough MON to pay for this deployment. Fund it with test MON, then deploy again."
              : network === "local"
                ? "Your app wallet doesn’t have enough MON. The local devnet hasn’t funded it — switch to Testnet to use the faucet."
                : "Your app wallet doesn’t have enough MON to pay for this deployment."}
        </p>
        {addr !== null ? <CopyAddress address={addr} /> : null}
        <div className="flex flex-wrap gap-2">
          {faucetUrl !== null ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => openExternal(faucetUrl)}
            >
              <ExternalLink />
              Get test MON
            </Button>
          ) : network === "local" ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => onSwitchNetwork("testnet")}
            >
              Switch to Testnet
            </Button>
          ) : null}
        </div>
        <ErrorDetails message={message} />
      </div>
    );
  }

  // Solidity build failures — the diagnostic text is the value, keep it
  // readable but contained.
  if (isBuild) {
    return (
      <div className="flex flex-col gap-1.5 rounded-lg border border-destructive/40 bg-destructive/10 p-3">
        <div className="flex items-center gap-1.5 text-xs font-medium text-destructive-foreground">
          <TriangleAlert className="size-3.5 shrink-0" />
          Build failed
        </div>
        <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded bg-background/40 p-2 font-mono text-[11px] text-muted-foreground">
          {message.trim()}
        </pre>
      </div>
    );
  }

  // Anything else — summarise to the first line, full text under Details.
  const firstLine = message.split("\n")[0]?.trim() ?? message;
  return (
    <div className="flex flex-col gap-1.5 rounded-lg border border-destructive/40 bg-destructive/10 p-3">
      <div className="flex items-center gap-1.5 text-xs font-medium text-destructive-foreground">
        <TriangleAlert className="size-3.5 shrink-0" />
        Deploy failed
      </div>
      <p className="text-[11px] leading-relaxed text-muted-foreground">
        {firstLine.length > 160 ? `${firstLine.slice(0, 160)}…` : firstLine}
      </p>
      <ErrorDetails message={message} />
    </div>
  );
}

/** A labelled, click-to-copy wallet address chip. */
function CopyAddress({ address }: { address: string }): React.ReactElement {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard?.writeText(address).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      },
      () => {
        /* clipboard unavailable — no-op */
      },
    );
  };
  return (
    <button
      type="button"
      onClick={copy}
      title="Copy full address"
      className="group flex w-full items-center justify-between gap-2 rounded-md border border-border bg-background/60 px-2.5 py-2 text-left transition-colors hover:bg-muted"
    >
      <span className="flex min-w-0 flex-col">
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground/70">
          App wallet
        </span>
        <span className="truncate font-mono text-xs text-foreground">
          {address}
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground transition-colors group-hover:text-foreground">
        {copied ? (
          <>
            <Check className="size-3.5 text-success" />
            Copied
          </>
        ) : (
          <>
            <Copy className="size-3.5" />
            Copy
          </>
        )}
      </span>
    </button>
  );
}

/** Collapsible raw error text — hidden by default so the card stays clean. */
function ErrorDetails({ message }: { message: string }): React.ReactElement {
  return (
    <details className="group">
      <summary className="cursor-pointer list-none text-[11px] text-muted-foreground/70 transition-colors hover:text-foreground">
        Show details
      </summary>
      <pre className="mt-1.5 max-h-40 overflow-auto whitespace-pre-wrap rounded bg-background/40 p-2 font-mono text-[10px] text-muted-foreground">
        {message.trim()}
      </pre>
    </details>
  );
}

function DeployRow({ deploy }: { deploy: DeployRecord }): React.ReactElement {
  const net = (deploy.network as "local" | "testnet" | "mainnet") ?? "testnet";
  const addrUrl = explorerAddressUrl(net, deploy.address);
  const txUrl = explorerTxUrl(net, deploy.txHash);
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-card px-3 py-2">
      <div className="flex min-w-0 flex-col">
        <div className="flex items-center gap-1.5">
          <CheckCircle2 className="size-3.5 shrink-0 text-success" />
          <span className="truncate text-sm font-medium text-foreground">
            {deploy.contractName}
          </span>
          <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
            {deploy.network}
          </span>
        </div>
        <span className="truncate font-mono text-[11px] text-muted-foreground">
          {truncateAddress(deploy.address)}
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-0.5">
        {addrUrl ? (
          <button
            type="button"
            title="Open contract on explorer"
            onClick={() => openExternal(addrUrl)}
            className="flex size-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <ExternalLink className="size-3.5" />
          </button>
        ) : txUrl ? (
          <button
            type="button"
            title="Open tx on explorer"
            onClick={() => openExternal(txUrl)}
            className="flex size-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <ExternalLink className="size-3.5" />
          </button>
        ) : null}
      </div>
    </div>
  );
}

/**
 * The persistent "Live app" box: the saved public share URL. Stays visible
 * across reloads (loaded from the DB) so the user always has the shareable link
 * handy to copy, open, or open in a real browser to share.
 */
function PublishedCard({
  url,
  onOpen,
  onOpenExternal,
}: {
  url: string;
  onOpen: (url: string) => void;
  onOpenExternal: (url: string) => void;
}): React.ReactElement {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-success/30 bg-success/[0.06] p-3">
      <div className="flex items-center gap-1.5 text-sm font-medium text-foreground">
        <Globe className="size-4 shrink-0 text-success" />
        Your live app
      </div>
      <ShareUrl url={url} />
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="outline"
          className="flex-1"
          onClick={() => onOpen(url)}
        >
          <Play />
          Open
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="flex-1"
          onClick={() => onOpenExternal(url)}
        >
          <ExternalLink />
          Share
        </Button>
      </div>
    </div>
  );
}

/**
 * The primary testnet action: a one-click full-stack ship (contract → Convex →
 * frontend → Vercel) where each stage is a toggle you can skip. Before a run the
 * rows are checkboxes; during/after they become a progress stepper.
 */
function ShipCard({
  contract,
  cloud,
  stages,
  alreadyLive,
  connections,
  connecting,
  connect,
  onConnect,
  onOpenAuthUrl,
  onSetupConvex,
  onToggle,
  onRun,
  onOpen,
}: {
  contract: string;
  cloud: CloudState;
  stages: Stages;
  alreadyLive: string | null;
  connections: { convex: boolean; vercel: boolean };
  connecting: { convex: boolean; vercel: boolean };
  connect: {
    service: "convex" | "vercel";
    url: string | null;
    status: "connecting" | "done" | "error";
    message: string | null;
    logs: readonly string[];
  } | null;
  onConnect: (service: "convex" | "vercel") => void;
  onOpenAuthUrl: (url: string) => void;
  onSetupConvex: () => void;
  onToggle: (stage: Stage) => void;
  onRun: () => void;
  onOpen: (url: string) => void;
}): React.ReactElement {
  const running = cloud.running;
  const finished =
    !running &&
    (cloud.shareUrl !== null ||
      cloud.contractAddress !== null ||
      cloud.error !== null);
  // Rows are a live stepper only while running; once done they return to
  // toggles so the user can reconfigure and ship again.
  const showStatus = running;
  const nothingSelected =
    !stages.contract && !stages.convex && !stages.publish;

  // A stage that needs a cloud account can't ship until it's connected.
  const needConvex = stages.convex && !connections.convex;
  const needVercel = stages.publish && !connections.vercel;
  const blocked = needConvex || needVercel;

  const buttonLabel = stages.publish
    ? finished
      ? "Ship again"
      : "Ship to the cloud"
    : stages.contract && !stages.convex
      ? "Deploy contract"
      : "Run selected steps";

  return (
    <Card>
      <CardHeader title="Deploy">
        <span className="text-[10px] text-muted-foreground/70">
          testnet · Convex + Vercel
        </span>
      </CardHeader>

      {/* Cloud account connections */}
      <div className="flex flex-wrap gap-1.5">
        <ConnectChip
          label="Convex"
          connected={connections.convex}
          connecting={connecting.convex}
          onConnect={() => onConnect("convex")}
        />
        <ConnectChip
          label="Vercel"
          connected={connections.vercel}
          connecting={connecting.vercel}
          onConnect={() => onConnect("vercel")}
        />
        <button
          type="button"
          onClick={onSetupConvex}
          title="Run Convex's one-time interactive setup in the terminal"
          className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <SquareTerminal className="size-3" />
          Set up Convex
        </button>
      </div>

      {/* Active sign-in: show the auth URL as a fallback + status */}
      {connect !== null &&
      (connect.status === "connecting" || connect.status === "error") ? (
        <div
          className={
            connect.status === "error"
              ? "flex flex-col gap-1.5 rounded-lg border border-destructive/40 bg-destructive/10 p-2.5 text-[11px]"
              : "flex flex-col gap-1.5 rounded-lg border border-border bg-muted/30 p-2.5 text-[11px]"
          }
        >
          {connect.status === "connecting" ? (
            <span className="text-muted-foreground">
              {connect.url !== null
                ? `Finishing ${connect.service === "convex" ? "Convex" : "Vercel"} sign-in in your browser…`
                : `Starting ${connect.service === "convex" ? "Convex" : "Vercel"} sign-in…`}
            </span>
          ) : (
            <span className="text-destructive-foreground">
              {connect.message ?? "Sign-in failed."}
            </span>
          )}
          {connect.url !== null ? (
            <button
              type="button"
              onClick={() => onOpenAuthUrl(connect.url as string)}
              className="flex items-center gap-1 self-start text-foreground underline-offset-2 hover:underline"
            >
              <ExternalLink className="size-3" />
              Browser didn’t open? Click to sign in
            </button>
          ) : null}
          {connect.logs.length > 0 ? (
            <pre className="mt-0.5 max-h-32 overflow-auto whitespace-pre-wrap rounded bg-background/40 p-2 font-mono text-[10px] text-muted-foreground">
              {connect.logs.join("\n")}
            </pre>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-col">
        <StageRow
          stage="contract"
          enabled={stages.contract}
          status={cloud.steps.contract}
          showStatus={showStatus}
          disabled={running}
          onToggle={() => onToggle("contract")}
          note={
            alreadyLive !== null && !stages.contract
              ? `live · ${truncateAddress(alreadyLive)}`
              : null
          }
        />
        <StageRow
          stage="convex"
          enabled={stages.convex}
          status={cloud.steps.convex}
          showStatus={showStatus}
          disabled={running}
          onToggle={() => onToggle("convex")}
          note={null}
        />
        <StageRow
          stage="publish"
          enabled={stages.publish}
          status={cloud.steps.publish}
          showStatus={showStatus}
          disabled={running}
          onToggle={() => onToggle("publish")}
          note={null}
        />
      </div>

      {!running ? (
        <>
          <Button
            loading={running}
            disabled={nothingSelected || blocked}
            onClick={onRun}
            title={`Deploy ${contract} and the selected steps`}
          >
            <Rocket />
            {buttonLabel}
          </Button>
          {blocked ? (
            <p className="text-center text-[11px] text-muted-foreground">
              Connect{" "}
              {needConvex && needVercel
                ? "Convex and Vercel"
                : needConvex
                  ? "Convex"
                  : "Vercel"}{" "}
              above to ship.
            </p>
          ) : null}
        </>
      ) : null}

      {cloud.error !== null ? (
        <div className="flex flex-col gap-1 rounded-lg border border-destructive/40 bg-destructive/10 p-2.5 text-[11px] text-destructive-foreground">
          <div className="flex items-start gap-1.5">
            <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
            <span className="whitespace-pre-wrap leading-relaxed">
              {cloud.error}
            </span>
          </div>
          <span className="pl-5 text-[10px] text-muted-foreground">
            Full log: ~/.monkit/cloud-deploy.log
          </span>
        </div>
      ) : null}

      {cloud.shareUrl !== null ? (
        <div className="flex flex-col gap-2 rounded-lg border border-success/30 bg-success/[0.06] p-3">
          <div className="flex items-center gap-1.5 text-sm font-medium text-foreground">
            <CheckCircle2 className="size-4 shrink-0 text-success" />
            Your dApp is live
          </div>
          <ShareUrl url={cloud.shareUrl} />
          <Button
            size="sm"
            variant="outline"
            onClick={() => onOpen(cloud.shareUrl as string)}
          >
            <ExternalLink />
            Open dApp
          </Button>
        </div>
      ) : finished &&
        cloud.error === null &&
        cloud.contractAddress !== null ? (
        <div className="flex flex-col gap-2 rounded-lg border border-success/30 bg-success/[0.06] p-3">
          <div className="flex items-center gap-1.5 text-sm font-medium text-foreground">
            <CheckCircle2 className="size-4 shrink-0 text-success" />
            Contract deployed
          </div>
          <CopyAddress address={cloud.contractAddress} />
        </div>
      ) : null}

      {cloud.logTail.length > 0 && cloud.shareUrl === null ? (
        <details className="group">
          <summary className="cursor-pointer list-none text-[11px] text-muted-foreground/70 transition-colors hover:text-foreground">
            {running ? "Show progress logs" : "Show logs"}
          </summary>
          <pre className="mt-1.5 max-h-40 overflow-auto whitespace-pre-wrap rounded bg-background/40 p-2 font-mono text-[10px] text-muted-foreground">
            {cloud.logTail.join("\n")}
          </pre>
        </details>
      ) : null}
    </Card>
  );
}

/**
 * A small account chip: shows "✓ Connected" once linked, or a "Connect" button
 * that kicks off the in-app device-flow login (opens the browser). No terminal.
 */
function ConnectChip({
  label,
  connected,
  connecting,
  onConnect,
}: {
  label: string;
  connected: boolean;
  connecting: boolean;
  onConnect: () => void;
}): React.ReactElement {
  if (connected) {
    return (
      <span className="flex items-center gap-1 rounded-md border border-success/30 bg-success/[0.06] px-2 py-1 text-[11px] text-foreground">
        <CheckCircle2 className="size-3 text-success" />
        {label}
      </span>
    );
  }
  return (
    <button
      type="button"
      disabled={connecting}
      onClick={onConnect}
      className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-70"
      title={`Connect ${label} — opens your browser to sign in`}
    >
      {connecting ? (
        <>
          <Loader2 className="size-3 animate-spin" />
          {label} · waiting…
        </>
      ) : (
        <>
          <LinkIcon className="size-3" />
          Connect {label}
        </>
      )}
    </button>
  );
}

/**
 * A single stage row that is a checkbox before a run and a status icon during/
 * after it. Keeps the checklist and the progress stepper as one tidy element.
 */
function StageRow({
  stage,
  enabled,
  status,
  showStatus,
  disabled,
  onToggle,
  note,
}: {
  stage: Stage;
  enabled: boolean;
  status: StepStatus;
  showStatus: boolean;
  disabled: boolean;
  onToggle: () => void;
  note: string | null;
}): React.ReactElement {
  const { label, hint } = STAGE_META[stage];
  const dim = showStatus ? !enabled : false;

  const control = showStatus ? (
    !enabled ? (
      <div className="size-4 shrink-0" />
    ) : status === "done" ? (
      <CheckCircle2 className="size-4 shrink-0 text-success" />
    ) : status === "failed" ? (
      <TriangleAlert className="size-4 shrink-0 text-destructive" />
    ) : status === "active" ? (
      <Loader2 className="size-4 shrink-0 animate-spin text-primary" />
    ) : (
      <div className="size-4 shrink-0 rounded-full border border-border" />
    )
  ) : (
    <span
      className={
        enabled
          ? "flex size-4 shrink-0 items-center justify-center rounded-[5px] bg-primary text-primary-foreground"
          : "flex size-4 shrink-0 items-center justify-center rounded-[5px] border border-input"
      }
    >
      {enabled ? <Check className="size-3" /> : null}
    </span>
  );

  const row = (
    <div className="flex items-center gap-2.5 py-1.5">
      {control}
      <span className="flex min-w-0 flex-1 items-baseline gap-1.5">
        <span
          className={
            dim
              ? "text-xs text-muted-foreground/50 line-through"
              : status === "failed" && showStatus
                ? "text-xs text-destructive-foreground"
                : "text-xs text-foreground"
          }
        >
          {label}
        </span>
        <span className="truncate text-[10px] text-muted-foreground/70">
          {note ?? hint}
        </span>
      </span>
    </div>
  );

  if (showStatus) return row;
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onToggle}
      className="-mx-1 rounded-lg px-1 text-left transition-colors hover:bg-muted/50 disabled:opacity-60"
    >
      {row}
    </button>
  );
}

/**
 * Plain on-chain deploy for local / mainnet (no Convex/Vercel). Cloud ship is
 * testnet-only, so other networks get the single-action card with a nudge to
 * switch to testnet to publish a shareable app.
 */
function PlainDeployCard({
  contract,
  network,
  deploying,
  error,
  onDeploy,
  onSwitchNetwork,
  onSwitchTestnet,
}: {
  contract: string;
  network: NetworkId;
  deploying: boolean;
  error: string | null;
  onDeploy: () => void;
  onSwitchNetwork: (id: NetworkId) => void;
  onSwitchTestnet: () => void;
}): React.ReactElement {
  return (
    <Card>
      <CardHeader title="Deploy">
        <span className="text-[10px] text-muted-foreground/70">
          {NETWORK_META[network].label}
        </span>
      </CardHeader>
      <Button loading={deploying} onClick={onDeploy}>
        <Rocket />
        Deploy {contract} to {NETWORK_META[network].short}
      </Button>
      <button
        type="button"
        onClick={onSwitchTestnet}
        className="text-left text-[11px] text-muted-foreground transition-colors hover:text-foreground"
      >
        Want a shareable URL? Switch to Testnet to publish to the cloud →
      </button>
      {error !== null ? (
        <MonadErrorCard
          message={error}
          network={network}
          context="deploy"
          onSwitchNetwork={onSwitchNetwork}
        />
      ) : null}
    </Card>
  );
}

/** Frontend dev server + bindings, as a card. */
function FrontendCard({
  frontend,
  busy,
  bindingsBusy,
  onRun,
  onStop,
  onOpen,
  onBindings,
}: {
  frontend: { running: boolean; url: string | null; pm: string | null };
  busy: boolean;
  bindingsBusy: boolean;
  onRun: () => void;
  onStop: () => void;
  onOpen: (url: string) => void;
  onBindings: () => void;
}): React.ReactElement {
  return (
    <Card>
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2 text-xs">
          <Globe className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="font-semibold uppercase tracking-wide text-muted-foreground">
            Frontend
          </span>
          <span
            className={
              frontend.running
                ? "truncate text-success-foreground"
                : "text-muted-foreground/70"
            }
          >
            {frontend.running ? (frontend.url ?? "running") : "stopped"}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            size="xs"
            variant="ghost"
            loading={bindingsBusy}
            onClick={onBindings}
            title="Rewrite frontend/src/contracts from deploy history"
          >
            <RefreshCw />
            Bindings
          </Button>
          {frontend.running && frontend.url !== null ? (
            <Button
              size="xs"
              variant="outline"
              onClick={() => onOpen(frontend.url as string)}
            >
              Open
            </Button>
          ) : null}
          <Button
            size="xs"
            variant="outline"
            loading={busy}
            onClick={frontend.running ? onStop : onRun}
          >
            {frontend.running ? <Square /> : <Play />}
            {frontend.running ? "Stop" : "Run"}
          </Button>
        </div>
      </div>
    </Card>
  );
}

/** Local devnet status + start, as a card. */
function DevnetCard({
  running,
  busy,
  onStart,
}: {
  running: boolean;
  busy: boolean;
  onStart: () => void;
}): React.ReactElement {
  return (
    <Card>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs">
          <Server className="size-3.5 text-muted-foreground" />
          <span className="font-semibold uppercase tracking-wide text-muted-foreground">
            Local devnet
          </span>
          <span
            className={
              running ? "text-success-foreground" : "text-muted-foreground/70"
            }
          >
            {running ? "running" : "stopped"}
          </span>
        </div>
        {!running ? (
          <Button size="xs" variant="outline" loading={busy} onClick={onStart}>
            Start devnet
          </Button>
        ) : null}
      </div>
    </Card>
  );
}

/** Click-to-copy shareable URL chip. */
function ShareUrl({ url }: { url: string }): React.ReactElement {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard?.writeText(url).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      },
      () => {
        /* clipboard unavailable — no-op */
      },
    );
  };
  return (
    <button
      type="button"
      onClick={copy}
      title="Copy link"
      className="group flex w-full items-center justify-between gap-2 rounded-md border border-border bg-background/60 px-2.5 py-2 text-left transition-colors hover:bg-muted"
    >
      <span className="truncate font-mono text-xs text-foreground">{url}</span>
      <span className="flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground transition-colors group-hover:text-foreground">
        {copied ? (
          <>
            <Check className="size-3.5 text-success" />
            Copied
          </>
        ) : (
          <>
            <Copy className="size-3.5" />
            Copy
          </>
        )}
      </span>
    </button>
  );
}

function FoundryBanner(): React.ReactElement {
  return (
    <div className="flex flex-col gap-2 rounded-lg bg-warning/10 p-3 text-xs">
      <span className="font-medium text-warning-foreground">
        Foundry isn’t installed
      </span>
      <span className="text-muted-foreground">
        Compiling and deploying needs the Foundry toolchain (forge + anvil).
      </span>
      <code className="rounded bg-muted/60 px-2 py-1 font-mono text-[11px] text-foreground">
        curl -L https://foundry.paradigm.xyz | bash && foundryup
      </code>
    </div>
  );
}
