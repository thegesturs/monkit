import { Effect } from "effect";
import {
  CheckCircle2,
  ExternalLink,
  FileCode2,
  Fuel,
  Globe,
  Hammer,
  Loader2,
  Play,
  RefreshCw,
  Rocket,
  Server,
  Square,
  TriangleAlert,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import type {
  CompiledContractInfo,
  DeployRecord,
  NetworkId,
} from "@memoize/wire";

import { getRpcClient } from "../../lib/rpc-client.ts";
import { useMonadStore } from "../../store/monad.ts";
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

export function DeployPanel({
  projectId,
}: {
  projectId: string;
}): React.ReactElement {
  const network = useMonadStore((s) => s.activeNetwork);
  const setActiveNetwork = useMonadStore((s) => s.setActiveNetwork);
  const openInBrowser = useUiStore((s) => s.openInBrowser);

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

  useEffect(() => {
    void loadHistory();
    void refreshDevnet();
    void refreshFrontend();
  }, [loadHistory, refreshDevnet, refreshFrontend]);

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

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      {/* Local devnet strip */}
      {network === "local" ? (
        <div className="flex items-center justify-between gap-2 border-b border-border/60 px-3 py-2">
          <div className="flex items-center gap-2 text-xs">
            <Server className="size-3.5 text-muted-foreground" />
            <span className="text-muted-foreground">Local devnet</span>
            <span
              className={
                devnetRunning
                  ? "text-success-foreground"
                  : "text-muted-foreground"
              }
            >
              {devnetRunning ? "running" : "stopped"}
            </span>
          </div>
          {!devnetRunning ? (
            <Button
              size="xs"
              variant="outline"
              loading={devnetBusy}
              onClick={() => void startDevnet()}
            >
              Start devnet
            </Button>
          ) : null}
        </div>
      ) : null}

      {/* Frontend dev server + bindings */}
      <div className="flex items-center justify-between gap-2 border-b border-border/60 px-3 py-2">
        <div className="flex min-w-0 items-center gap-2 text-xs">
          <Globe className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="text-muted-foreground">Frontend</span>
          <span
            className={
              frontend.running
                ? "truncate text-success-foreground"
                : "text-muted-foreground"
            }
          >
            {frontend.running ? (frontend.url ?? "running") : "stopped"}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            size="xs"
            variant="ghost"
            loading={codegenBusy}
            onClick={() => void regenerateBindings()}
            title="Rewrite frontend/src/contracts from deploy history"
          >
            <RefreshCw />
            Bindings
          </Button>
          {frontend.running && frontend.url !== null ? (
            <Button
              size="xs"
              variant="outline"
              onClick={() => openInBrowser(frontend.url as string)}
            >
              Open
            </Button>
          ) : null}
          <Button
            size="xs"
            variant="outline"
            loading={frontendBusy}
            onClick={() =>
              void (frontend.running ? stopFrontend() : startFrontend())
            }
          >
            {frontend.running ? <Square /> : <Play />}
            {frontend.running ? "Stop" : "Run"}
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-3 p-3">
        {/* Compile + contract selection */}
        <div className="flex flex-col gap-2 rounded-xl border border-border bg-card p-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Contract
            </span>
            <Button
              size="xs"
              variant="outline"
              loading={compile.kind === "compiling"}
              onClick={() => void runCompile()}
            >
              <Hammer />
              {compile.kind === "ready" ? "Recompile" : "Compile"}
            </Button>
          </div>

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
                <p className="text-[11px] text-muted-foreground">
                  {compile.contracts.length === 1
                    ? "Found 1 contract — pick a network and deploy."
                    : `Found ${compile.contracts.length} contracts — select one to deploy.`}
                </p>
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
        </div>

        {/* Deploy action */}
        {selectedContract ? (
          <div className="flex flex-col gap-2">
            <Button loading={deploying} onClick={() => void runDeploy()}>
              <Rocket />
              Deploy {selectedContract.name} to {NETWORK_META[network].short}
            </Button>
            {network !== "local" ? (
              <p className="text-center text-[11px] text-muted-foreground">
                Deploys to {NETWORK_META[network].label} and signs with your
                most recent burner wallet.
              </p>
            ) : null}
            {deployError !== null ? (
              <MonadErrorCard
                message={deployError}
                network={network}
                context="deploy"
                onSwitchNetwork={(id) => void setActiveNetwork(id)}
              />
            ) : null}
          </div>
        ) : null}

        {/* Deploy history */}
        {deploys.length > 0 ? (
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              History
            </span>
            {deploys.map((d) => (
              <DeployRow key={d.id} deploy={d} />
            ))}
          </div>
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
      <div className="flex flex-col gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3">
        <div className="flex items-center gap-1.5 text-xs font-medium text-warning-foreground">
          <Fuel className="size-3.5 shrink-0" />
          Not enough gas to deploy
        </div>
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          Your app wallet{addr ? ` (${truncateAddress(addr)})` : ""} has no MON
          to pay for this deployment
          {faucetUrl !== null
            ? ". Grab some test MON, then deploy again."
            : network === "local"
              ? ". The local devnet hasn’t funded it — switch to Testnet and use the faucet."
              : "."}
        </p>
        <div className="flex flex-wrap gap-1.5">
          {faucetUrl !== null ? (
            <Button size="xs" onClick={() => openExternal(faucetUrl)}>
              <ExternalLink />
              Get test MON
            </Button>
          ) : network === "local" ? (
            <Button size="xs" onClick={() => onSwitchNetwork("testnet")}>
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
