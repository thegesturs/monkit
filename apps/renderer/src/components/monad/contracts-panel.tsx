import { Effect } from "effect";
import {
  ArrowRight,
  CheckCircle2,
  ExternalLink,
  Eye,
  Loader2,
  PencilLine,
  ScrollText,
  TriangleAlert,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import type {
  ContractFunctionInfo,
  DeployRecord,
  NetworkId,
} from "@memoize/wire";

import { getRpcClient } from "../../lib/rpc-client.ts";
import { Button } from "../ui/button.tsx";
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

const inputClass =
  "w-full rounded-lg border border-input bg-background px-2.5 py-1.5 font-mono text-xs text-foreground outline-none ring-ring/24 transition-shadow placeholder:text-muted-foreground/60 focus-visible:border-ring focus-visible:ring-[3px]";

function asNetworkId(network: string): NetworkId {
  return network === "local" || network === "mainnet" ? network : "testnet";
}

/** Identity of the currently-selected deployment. */
interface SelectedContract {
  readonly id: string;
  readonly contractName: string;
  readonly address: string;
  readonly network: NetworkId;
}

export function ContractsPanel({
  projectId,
}: {
  projectId: string;
}): React.ReactElement {
  const [deploys, setDeploys] = useState<readonly DeployRecord[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const loadHistory = useCallback(async () => {
    try {
      const client = await getRpcClient();
      const list = await Effect.runPromise(
        client.monad["deploy.list"]({ projectId }),
      );
      setDeploys(list);
      // Auto-select the most recent deploy so the panel is immediately useful.
      setSelectedId((prev) =>
        prev !== null && list.some((d) => d.id === prev)
          ? prev
          : (list[0]?.id ?? null),
      );
    } catch {
      // history is best-effort
    } finally {
      setLoaded(true);
    }
  }, [projectId]);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  const selected = useMemo<SelectedContract | null>(() => {
    const d = deploys.find((x) => x.id === selectedId);
    return d
      ? {
          id: d.id,
          contractName: d.contractName,
          address: d.address,
          network: asNetworkId(d.network),
        }
      : null;
  }, [deploys, selectedId]);

  if (loaded && deploys.length === 0) {
    return (
      <Empty className="py-10">
        <EmptyMedia variant="icon">
          <ScrollText />
        </EmptyMedia>
        <EmptyTitle>No contracts deployed yet</EmptyTitle>
        <EmptyDescription>
          Deploy a contract from the Deploy tab. Once it’s on-chain, this panel
          reads its ABI and gives you a form to call its functions — no
          copy-pasting ABIs.
        </EmptyDescription>
      </Empty>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="flex flex-col gap-3 p-3">
        {/* Deployed-contract picker */}
        <div className="flex flex-col gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Deployed contracts
          </span>
          <div className="flex flex-col gap-1.5">
            {deploys.map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => setSelectedId(d.id)}
                className={
                  d.id === selectedId
                    ? "flex items-center justify-between gap-2 rounded-lg border border-primary bg-primary/10 px-3 py-2 text-left"
                    : "flex items-center justify-between gap-2 rounded-lg border border-border bg-card px-3 py-2 text-left transition-colors hover:bg-muted"
                }
              >
                <div className="flex min-w-0 flex-col">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-sm font-medium text-foreground">
                      {d.contractName}
                    </span>
                    <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                      {d.network}
                    </span>
                  </div>
                  <span className="truncate font-mono text-[11px] text-muted-foreground">
                    {truncateAddress(d.address)}
                  </span>
                </div>
                {d.id === selectedId ? (
                  <CheckCircle2 className="size-4 shrink-0 text-primary" />
                ) : null}
              </button>
            ))}
          </div>
        </div>

        {selected ? (
          <ContractInteract
            key={selected.id}
            projectId={projectId}
            selected={selected}
          />
        ) : null}
      </div>
    </div>
  );
}

/** Loads the selected contract's ABI and renders the read/write sections. */
function ContractInteract({
  projectId,
  selected,
}: {
  projectId: string;
  selected: SelectedContract;
}): React.ReactElement {
  const [fns, setFns] = useState<{
    reads: readonly ContractFunctionInfo[];
    writes: readonly ContractFunctionInfo[];
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setFns(null);
    void (async () => {
      try {
        const client = await getRpcClient();
        const res = await Effect.runPromise(
          client.monad["contract.functions"]({
            projectId,
            contractName: selected.contractName,
          }),
        );
        if (!cancelled) setFns(res);
      } catch (err) {
        if (!cancelled)
          setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, selected.contractName]);

  const addrUrl = explorerAddressUrl(selected.network, selected.address);

  if (loading) {
    return (
      <div className="flex items-center gap-2 px-1 py-4 text-xs text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" />
        Reading {selected.contractName}’s ABI…
      </div>
    );
  }

  if (error !== null) {
    return (
      <div className="flex flex-col gap-1.5 rounded-lg border border-destructive/40 bg-destructive/10 p-3">
        <div className="flex items-center gap-1.5 text-xs font-medium text-destructive-foreground">
          <TriangleAlert className="size-3.5 shrink-0" />
          Couldn’t read the contract
        </div>
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          {error}
        </p>
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          Make sure <code>{selected.contractName}</code> still compiles — the
          ABI comes from your latest build.
        </p>
      </div>
    );
  }

  const reads = fns?.reads ?? [];
  const writes = fns?.writes ?? [];

  return (
    <div className="flex flex-col gap-4">
      {addrUrl !== null ? (
        <button
          type="button"
          onClick={() => openExternal(addrUrl)}
          className="flex items-center gap-1 self-start text-[11px] text-muted-foreground transition-colors hover:text-foreground"
        >
          View on explorer
          <ExternalLink className="size-3" />
        </button>
      ) : null}

      {/* Read section */}
      <section className="flex flex-col gap-2">
        <div className="flex items-center gap-1.5">
          <Eye className="size-3.5 text-muted-foreground" />
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Read
          </span>
          <span className="text-[10px] text-muted-foreground/60">
            free · no wallet
          </span>
        </div>
        {reads.length === 0 ? (
          <p className="text-[11px] text-muted-foreground">
            No read functions on this contract.
          </p>
        ) : (
          reads.map((fn) => (
            <ReadFunction
              key={fn.name}
              projectId={projectId}
              selected={selected}
              fn={fn}
            />
          ))
        )}
      </section>

      {/* Write section */}
      <section className="flex flex-col gap-2">
        <div className="flex items-center gap-1.5">
          <PencilLine className="size-3.5 text-muted-foreground" />
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Write
          </span>
          <span className="text-[10px] text-muted-foreground/60">
            signs a transaction
          </span>
        </div>
        {writes.length === 0 ? (
          <p className="text-[11px] text-muted-foreground">
            No write functions on this contract.
          </p>
        ) : (
          writes.map((fn) => (
            <WriteFunction
              key={fn.name}
              projectId={projectId}
              selected={selected}
              fn={fn}
            />
          ))
        )}
      </section>
    </div>
  );
}

/** Per-function arg inputs. Returns the raw string args in declared order. */
function useArgs(fn: ContractFunctionInfo) {
  const [args, setArgs] = useState<Record<number, string>>({});
  const ordered = fn.inputs.map((_, i) => args[i] ?? "");
  const setArg = (i: number, v: string) =>
    setArgs((prev) => ({ ...prev, [i]: v }));
  return { ordered, setArg, args };
}

function ArgInputs({
  fn,
  args,
  setArg,
}: {
  fn: ContractFunctionInfo;
  args: Record<number, string>;
  setArg: (i: number, v: string) => void;
}): React.ReactElement | null {
  if (fn.inputs.length === 0) return null;
  return (
    <div className="flex flex-col gap-1.5">
      {fn.inputs.map((input, i) => (
        <label key={i} className="flex flex-col gap-1">
          <span className="font-mono text-[10px] text-muted-foreground">
            {input.name} <span className="opacity-60">{input.type}</span>
          </span>
          <input
            value={args[i] ?? ""}
            onChange={(e) => setArg(i, e.target.value)}
            placeholder={input.type}
            className={inputClass}
          />
        </label>
      ))}
    </div>
  );
}

function ReadFunction({
  projectId,
  selected,
  fn,
}: {
  projectId: string;
  selected: SelectedContract;
  fn: ContractFunctionInfo;
}): React.ReactElement {
  const { ordered, setArg, args } = useArgs(fn);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const call = useCallback(
    async (callArgs: readonly string[]) => {
      setBusy(true);
      setError(null);
      try {
        const client = await getRpcClient();
        const res = await Effect.runPromise(
          client.monad["contract.read"]({
            projectId,
            contractName: selected.contractName,
            address: selected.address,
            network: selected.network,
            functionName: fn.name,
            args: callArgs,
          }),
        );
        setResult(res.result);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setBusy(false);
      }
    },
    [projectId, selected, fn.name],
  );

  // Auto-display current value for zero-arg reads (per the interaction spec).
  const noArgs = fn.inputs.length === 0;
  useEffect(() => {
    if (noArgs) void call([]);
  }, [noArgs, call]);

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-card p-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="truncate font-mono text-xs font-medium text-foreground">
          {fn.name}
        </span>
        <Button
          size="xs"
          variant="outline"
          loading={busy}
          onClick={() => void call(ordered)}
        >
          {noArgs ? "Refresh" : "Call"}
        </Button>
      </div>
      <ArgInputs fn={fn} args={args} setArg={setArg} />
      {error !== null ? (
        <p className="font-mono text-[11px] text-destructive-foreground">
          {error}
        </p>
      ) : result !== null ? (
        <ResultValue value={result} />
      ) : null}
    </div>
  );
}

function WriteFunction({
  projectId,
  selected,
  fn,
}: {
  projectId: string;
  selected: SelectedContract;
  fn: ContractFunctionInfo;
}): React.ReactElement {
  const { ordered, setArg, args } = useArgs(fn);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tx, setTx] = useState<{
    txHash: string;
    status: string;
  } | null>(null);

  const payable = fn.stateMutability === "payable";

  const send = async () => {
    setBusy(true);
    setError(null);
    setTx(null);
    try {
      const client = await getRpcClient();
      const res = await Effect.runPromise(
        client.monad["contract.write"]({
          projectId,
          contractName: selected.contractName,
          address: selected.address,
          network: selected.network,
          functionName: fn.name,
          args: ordered,
          value: payable && value !== "" ? value : undefined,
        }),
      );
      setTx({ txHash: res.txHash, status: res.status });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const txUrl = tx ? explorerTxUrl(selected.network, tx.txHash) : null;

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-card p-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="truncate font-mono text-xs font-medium text-foreground">
          {fn.name}
          {payable ? (
            <span className="ml-1.5 rounded bg-warning/15 px-1 py-0.5 text-[9px] uppercase tracking-wide text-warning-foreground">
              payable
            </span>
          ) : null}
        </span>
        <Button size="xs" loading={busy} onClick={() => void send()}>
          Send
          <ArrowRight />
        </Button>
      </div>
      <ArgInputs fn={fn} args={args} setArg={setArg} />
      {payable ? (
        <label className="flex flex-col gap-1">
          <span className="font-mono text-[10px] text-muted-foreground">
            value <span className="opacity-60">wei</span>
          </span>
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="0"
            className={inputClass}
          />
        </label>
      ) : null}
      {error !== null ? (
        <div className="flex flex-col gap-1 rounded-md border border-destructive/40 bg-destructive/10 p-2">
          <span className="flex items-center gap-1 text-[11px] font-medium text-destructive-foreground">
            <TriangleAlert className="size-3" />
            {extractRevertReason(error)}
          </span>
          <details className="group">
            <summary className="cursor-pointer list-none text-[10px] text-muted-foreground/70 transition-colors hover:text-foreground">
              Show details
            </summary>
            <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap rounded bg-background/40 p-1.5 font-mono text-[10px] text-muted-foreground">
              {error.trim()}
            </pre>
          </details>
        </div>
      ) : tx !== null ? (
        <div className="flex items-center justify-between gap-2 rounded-md border border-success/30 bg-success/[0.06] p-2">
          <span className="flex items-center gap-1.5 text-[11px] text-foreground">
            <CheckCircle2 className="size-3.5 text-success" />
            {tx.status === "success" ? "Confirmed" : "Reverted"} ·{" "}
            <span className="font-mono text-muted-foreground">
              {truncateAddress(tx.txHash)}
            </span>
          </span>
          {txUrl !== null ? (
            <button
              type="button"
              onClick={() => openExternal(txUrl)}
              className="flex items-center gap-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
            >
              View
              <ExternalLink className="size-3" />
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** Pretty-print a read result: bare strings/numbers inline, JSON objects boxed. */
function ResultValue({ value }: { value: string }): React.ReactElement {
  let display = value;
  try {
    const parsed: unknown = JSON.parse(value);
    if (typeof parsed === "string" || typeof parsed === "number") {
      display = String(parsed);
    } else if (typeof parsed === "boolean") {
      display = parsed ? "true" : "false";
    }
  } catch {
    // leave as-is
  }
  return (
    <pre className="max-h-32 overflow-auto whitespace-pre-wrap rounded-md bg-muted/40 px-2 py-1.5 font-mono text-[11px] text-foreground">
      {display}
    </pre>
  );
}

/**
 * Pull the human reason out of a viem revert/error message. viem prefixes the
 * useful line, e.g. "execution reverted: Not owner" — show that, hide the rest.
 */
function extractRevertReason(message: string): string {
  const revert = message.match(/reverted(?:\s+with[^:]*)?:?\s*(.+)/i);
  if (revert?.[1]) return revert[1].split("\n")[0]!.trim();
  const first = message.split("\n")[0]?.trim() ?? message;
  return first.length > 140 ? `${first.slice(0, 140)}…` : first;
}
