# Feature: ABI auto-wire (frontend codegen)

## Why

The split-brain between contract addresses + ABIs (Solidity world) and the React frontend (TypeScript world) is the #1 friction point in dApp dev. Every deploy must auto-update the frontend so the user never copy-pastes an ABI again.

## What gets written

On every successful deploy, `monad-core/codegen.ts` writes two files into `<frontendDir>/src/contracts/`. The shape matches what the starter template's `index.ts` already consumes (`getAddress(name, chainId)` + `export * from "./abis"`) — **addresses are keyed by chainId then contract name**, and ABIs are inlined (no separate `.abi.json`, so no JSON-module tsconfig setup is needed).

### `addresses.ts`

```ts
// @generated — written by the deploy flow on every deploy. Don't hand-edit.
// Shape: { [chainId]: { [contractName]: "0x..." } }. Empty until the first deploy.

export const addresses: Record<number, Record<string, `0x${string}`>> = {
  10143: {
    Counter: "0xabc...",
  },
  41454: {
    Counter: "0x5FbDB2315678afecb367f032d93F642f64180aa3",
  },
};
```

The template's `index.ts` resolves an address with `getAddress(name, chainId)` → `addresses[chainId]?.[name]`.

### `abis.ts`

```ts
// @generated — the deploy flow writes contract ABIs here on every deploy.
// Empty until the first deploy. Don't hand-edit.

export const abis = {
  Counter: [
    {
      type: "function",
      name: "count",
      inputs: [],
      outputs: [{ type: "uint256" }],
      stateMutability: "view",
    },
    // ...
  ] as const,
} as const;

export type ContractName = keyof typeof abis;
```

Consumers call contracts directly with wagmi/viem using `abis.Counter` + `getAddress("Counter", chainId)`.

### `hooks.ts` (wagmi v2) — deferred

Generated wagmi hooks (`useCounter`, etc.) are a fast-follow. Raw `abis` + `addresses` + `getAddress` are enough to call contracts today; the hook layer is opinionated and lands later.

## Generation rules

- Both files start with `// @generated`. Codegen refuses to overwrite a file whose first line lacks that marker (protection against trashing hand-written files); it reports those in `skipped`.
- Codegen rebuilds the files **wholesale** from the project's full `monad_deploys` history (every chainId an address was deployed to) plus the freshest compiled ABIs — so re-deploys naturally preserve other networks and overwrite only the redeployed (contract, chainId).
- ABIs are written for every compiled contract (even never-deployed ones) so the frontend can import bindings before the first deploy.

## Trigger points

1. Successful deploy (auto, best-effort — a codegen failure never fails the deploy).
2. Manual **"Bindings"** (regenerate) button in the Deploy panel → `monad.codegen` RPC.
3. `monad_codegen` MCP tool (Phase 5 — lets the AI explicitly refresh after editing ABI shape).
4. Renaming or removing a contract: requires manual "Bindings" since we don't want to delete bindings on accident.

## Config

`monad.config.json` declares `frontendDir` (default `"frontend"`). If the dir doesn't exist, codegen no-ops with a banner.

## Out of scope

- Solidity event hooks (useWatchContractEvent) — defer to a follow-up; users can write them manually.
- Generating a typed wagmi config (chains array) — Phase 7.
- Generating React Native / non-wagmi consumers — defer.
