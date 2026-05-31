import { Effect } from "effect";
import {
  CheckCircle2,
  ExternalLink,
  Globe,
  Hammer,
  Play,
  RefreshCw,
  Rocket,
  Server,
  Square,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import type { CompiledContractInfo, DeployRecord } from "@memoize/wire";

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

  const runCompile = async () => {
    setCompile({ kind: "compiling" });
    setSelected(null);
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
      const only = res.contracts.length === 1 ? res.contracts[0] : null;
      if (only) setSelected(only.name);
    } catch (err) {
      setCompile({
        kind: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  };

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
            <p className="rounded-md bg-destructive/10 px-2.5 py-1.5 font-mono text-[11px] text-destructive-foreground whitespace-pre-wrap">
              {compile.message}
            </p>
          ) : compile.kind === "ready" ? (
            compile.contracts.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No deployable contracts found in <code>out/</code>.
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
                          ? "rounded-md bg-primary px-2.5 py-1 text-[11px] font-medium text-primary-foreground"
                          : "rounded-md border border-border px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      }
                    >
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
            <p className="text-xs text-muted-foreground">
              Compile the project to pick a contract to deploy.
            </p>
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
              <p className="rounded-md bg-destructive/10 px-2.5 py-1.5 font-mono text-[11px] text-destructive-foreground whitespace-pre-wrap">
                {deployError}
              </p>
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
        ) : compile.kind === "idle" ? (
          <Empty className="py-8">
            <EmptyMedia variant="icon">
              <Rocket />
            </EmptyMedia>
            <EmptyTitle>No deploys yet</EmptyTitle>
            <EmptyDescription>
              Compile your Foundry contracts, then deploy to the active network.
            </EmptyDescription>
          </Empty>
        ) : null}
      </div>
    </div>
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
