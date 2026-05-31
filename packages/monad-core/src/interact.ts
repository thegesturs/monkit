import {
  type Abi,
  type AbiFunction,
  createPublicClient,
  createWalletClient,
  http,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

import { getNetwork, type NetworkId } from "./networks.js";

function chainFor(networkId: NetworkId) {
  const net = getNetwork(networkId);
  return {
    id: net.chainId,
    name: net.name,
    nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
    rpcUrls: { default: { http: [net.rpcUrl] } },
  } as const;
}

export interface AbiParamInfo {
  readonly name: string;
  readonly type: string;
}

export interface AbiFunctionInfo {
  readonly name: string;
  /** "view" | "pure" | "nonpayable" | "payable" */
  readonly stateMutability: string;
  readonly inputs: readonly AbiParamInfo[];
  readonly outputs: readonly AbiParamInfo[];
}

/**
 * Split an ABI into reads (view/pure — free, no signature) and writes
 * (state-changing — need a signed tx). Constructors, events, fallbacks and
 * errors are dropped; only callable functions surface in the interaction UI.
 */
export function classifyAbiFunctions(abi: Abi): {
  reads: AbiFunctionInfo[];
  writes: AbiFunctionInfo[];
} {
  const reads: AbiFunctionInfo[] = [];
  const writes: AbiFunctionInfo[] = [];
  for (const entry of abi) {
    if (entry.type !== "function") continue;
    const fn = entry as AbiFunction;
    const info: AbiFunctionInfo = {
      name: fn.name,
      stateMutability: fn.stateMutability ?? "nonpayable",
      inputs: (fn.inputs ?? []).map((input, i) => ({
        name: input.name && input.name !== "" ? input.name : `arg${i}`,
        type: input.type,
      })),
      outputs: (fn.outputs ?? []).map((output, i) => ({
        name: output.name && output.name !== "" ? output.name : `out${i}`,
        type: output.type,
      })),
    };
    if (info.stateMutability === "view" || info.stateMutability === "pure") {
      reads.push(info);
    } else {
      writes.push(info);
    }
  }
  return { reads, writes };
}

/** Find a function entry by name in an ABI (first match). */
export function findAbiFunction(abi: Abi, name: string): AbiFunction | null {
  for (const entry of abi) {
    if (entry.type === "function" && (entry as AbiFunction).name === name) {
      return entry as AbiFunction;
    }
  }
  return null;
}

/**
 * Coerce a UI-supplied string arg into the JS type viem expects for the ABI
 * type. Mirrors the constructor-arg coercion in the deploy service: args cross
 * the wire as strings (bigint can't be JSON-serialized), so ints become
 * BigInt, bools parse, and arrays/tuples expect JSON.
 */
export function coerceArg(abiType: string, raw: unknown): unknown {
  if (typeof raw !== "string") return raw;
  if (abiType.endsWith("]") || abiType.startsWith("tuple")) {
    return JSON.parse(raw);
  }
  if (/^u?int\d*$/.test(abiType)) return BigInt(raw);
  if (abiType === "bool") return raw === "true" || raw === "1";
  return raw;
}

/** Coerce every raw arg against a function's declared input types. */
export function coerceArgs(
  fn: AbiFunction,
  rawArgs: readonly unknown[],
): unknown[] {
  const inputs = fn.inputs ?? [];
  return rawArgs.map((arg, i) => coerceArg(inputs[i]?.type ?? "string", arg));
}

/**
 * JSON-stringify a contract return value for transport. bigints (the common
 * case for uint returns) become decimal strings so the renderer can display
 * them; everything else serializes normally.
 */
export function stringifyContractResult(value: unknown): string {
  return JSON.stringify(
    value,
    (_key, v) => (typeof v === "bigint" ? v.toString() : v),
    2,
  );
}

export interface ReadContractOptions {
  readonly networkId: NetworkId;
  readonly address: Hex;
  readonly abi: Abi;
  readonly functionName: string;
  readonly args: readonly unknown[];
}

/** Call a view/pure function — no signature, no gas. */
export async function readContractFn(
  opts: ReadContractOptions,
): Promise<unknown> {
  const net = getNetwork(opts.networkId);
  const client = createPublicClient({
    chain: chainFor(opts.networkId),
    transport: http(net.rpcUrl),
  });
  return client.readContract({
    address: opts.address,
    abi: opts.abi,
    functionName: opts.functionName,
    args: opts.args as never,
  });
}

export interface WriteContractOptions {
  readonly networkId: NetworkId;
  readonly privateKey: Hex;
  readonly address: Hex;
  readonly abi: Abi;
  readonly functionName: string;
  readonly args: readonly unknown[];
  /** Native value (wei) for payable functions. */
  readonly value?: bigint;
}

export interface WriteContractResult {
  readonly txHash: Hex;
  readonly blockNumber: bigint | null;
  readonly status: "success" | "reverted";
}

/**
 * Send a state-changing call. We `simulateContract` first so reverts surface
 * with a decoded reason BEFORE the user pays gas — the same safety the deploy
 * preflight gives. The simulated request is what we actually send.
 */
export async function writeContractFn(
  opts: WriteContractOptions,
): Promise<WriteContractResult> {
  const net = getNetwork(opts.networkId);
  const chain = chainFor(opts.networkId);
  const account = privateKeyToAccount(opts.privateKey);
  const publicClient = createPublicClient({
    chain,
    transport: http(net.rpcUrl),
  });
  const wallet = createWalletClient({
    account,
    chain,
    transport: http(net.rpcUrl),
  });

  const { request } = await publicClient.simulateContract({
    account,
    address: opts.address,
    abi: opts.abi,
    functionName: opts.functionName,
    args: opts.args as never,
    value: opts.value,
  });

  const txHash = await wallet.writeContract(request as never);
  const receipt = await publicClient.waitForTransactionReceipt({
    hash: txHash,
  });
  return {
    txHash,
    blockNumber: receipt.blockNumber ?? null,
    status: receipt.status,
  };
}
