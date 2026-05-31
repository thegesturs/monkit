import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Abi } from "viem";

/** Marker every generated file leads with; codegen refuses to clobber files that lack it. */
const GENERATED_MARKER = "@generated";

export interface CodegenAddressEntry {
  readonly chainId: number;
  readonly address: `0x${string}`;
}

export interface CodegenContract {
  readonly name: string;
  readonly abi: Abi;
  /** Every (chainId → address) this contract has been deployed to. */
  readonly addresses: readonly CodegenAddressEntry[];
}

export interface CodegenResult {
  /** Relative file names written this run. */
  readonly written: readonly string[];
  /** Relative file names left untouched because they lacked the `@generated` marker. */
  readonly skipped: readonly string[];
}

const ADDRESSES_HEADER =
  "// @generated — written by the deploy flow on every deploy. Don't hand-edit.\n" +
  '// Shape: { [chainId]: { [contractName]: "0x..." } }. Empty until the first deploy.\n';

const ABIS_HEADER =
  "// @generated — the deploy flow writes contract ABIs here on every deploy.\n" +
  "// Empty until the first deploy. Don't hand-edit.\n";

/**
 * A file is safe to overwrite when it doesn't exist yet, or when its head
 * carries the `@generated` marker. Anything else is treated as hand-authored
 * and left alone (we'd rather skip than trash a user's edits).
 */
async function isOverwritable(path: string): Promise<boolean> {
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch {
    return true; // doesn't exist → safe to create
  }
  // Only trust the marker if it sits in the first line — a later mention in a
  // comment or string shouldn't unlock clobbering a real source file.
  const firstLine = raw.slice(0, raw.indexOf("\n") + 1 || raw.length);
  return firstLine.includes(GENERATED_MARKER);
}

function renderAddresses(contracts: readonly CodegenContract[]): string {
  // chainId → { contractName → address }, sorted for stable diffs.
  const byChain = new Map<number, Map<string, string>>();
  for (const c of contracts) {
    for (const entry of c.addresses) {
      const row = byChain.get(entry.chainId) ?? new Map<string, string>();
      row.set(c.name, entry.address);
      byChain.set(entry.chainId, row);
    }
  }

  const chainIds = [...byChain.keys()].sort((a, b) => a - b);
  const body = chainIds
    .map((chainId) => {
      const row = byChain.get(chainId)!;
      const names = [...row.keys()].sort();
      const inner = names
        .map((name) => `    ${JSON.stringify(name)}: "${row.get(name)}",`)
        .join("\n");
      return `  ${chainId}: {\n${inner}\n  },`;
    })
    .join("\n");

  const literal = chainIds.length === 0 ? "{}" : `{\n${body}\n}`;
  return `${ADDRESSES_HEADER}\nexport const addresses: Record<number, Record<string, \`0x\${string}\`>> = ${literal};\n`;
}

function renderAbis(contracts: readonly CodegenContract[]): string {
  const named = [...contracts]
    .filter((c) => c.abi.length > 0)
    .sort((a, b) => a.name.localeCompare(b.name));

  if (named.length === 0) {
    return `${ABIS_HEADER}\nexport const abis = {} as const;\n\nexport type ContractName = keyof typeof abis;\n`;
  }

  const body = named
    .map((c) => {
      const abiLiteral = JSON.stringify(c.abi, null, 2)
        .split("\n")
        .map((line, i) => (i === 0 ? line : `  ${line}`))
        .join("\n");
      return `  ${JSON.stringify(c.name)}: ${abiLiteral} as const,`;
    })
    .join("\n");

  return `${ABIS_HEADER}\nexport const abis = {\n${body}\n} as const;\n\nexport type ContractName = keyof typeof abis;\n`;
}

/**
 * Rewrite `<contractsDir>/{addresses.ts,abis.ts}` from the supplied contract
 * set. Callers gather the full picture (every deployed address + every
 * compiled ABI) and pass it in — we render the files wholesale, so re-deploys
 * naturally preserve other networks and overwrite only what changed. Pure I/O,
 * no Effect, so the server layer can wrap it however it likes.
 */
export async function writeFrontendBindings(opts: {
  readonly contractsDir: string;
  readonly contracts: readonly CodegenContract[];
}): Promise<CodegenResult> {
  await mkdir(opts.contractsDir, { recursive: true });

  const targets: { file: string; content: string }[] = [
    { file: "addresses.ts", content: renderAddresses(opts.contracts) },
    { file: "abis.ts", content: renderAbis(opts.contracts) },
  ];

  const written: string[] = [];
  const skipped: string[] = [];

  for (const t of targets) {
    const path = join(opts.contractsDir, t.file);
    if (await isOverwritable(path)) {
      await writeFile(path, t.content, "utf8");
      written.push(t.file);
    } else {
      skipped.push(t.file);
    }
  }

  return { written, skipped };
}
