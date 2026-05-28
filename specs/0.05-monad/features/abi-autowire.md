# Feature: ABI auto-wire (frontend codegen)

## Why

The split-brain between contract addresses + ABIs (Solidity world) and the React frontend (TypeScript world) is the #1 friction point in dApp dev. Every deploy must auto-update the frontend so the user never copy-pastes an ABI again.

## What gets written

On every successful deploy, `monad-core/codegen.ts` writes three files into `<frontendDir>/src/contracts/`:

### `addresses.ts`

```ts
// @generated — do not edit. Updated on every deploy.
import type { Address } from "viem"

export const addresses = {
  Counter: {
    local: "0x5FbDB2315678afecb367f032d93F642f64180aa3" as Address,
    testnet: "0xabc..." as Address,
  },
  WAGMI: {
    local: "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512" as Address,
  },
} as const

export type ContractName = keyof typeof addresses
```

### `abis.ts`

```ts
// @generated
import counterAbi from "./Counter.abi.json"
import wagmiAbi from "./WAGMI.abi.json"

export const abis = {
  Counter: counterAbi,
  WAGMI: wagmiAbi,
} as const
```

Plus one `<Contract>.abi.json` per contract written next to it.

### `hooks.ts` (wagmi v2)

```ts
// @generated
import { useReadContract, useWriteContract } from "wagmi"
import { abis } from "./abis"
import { addresses } from "./addresses"
import type { Address } from "viem"

export function useCounter(network: keyof typeof addresses.Counter) {
  const address = addresses.Counter[network]
  return {
    useCount: () => useReadContract({ abi: abis.Counter, address, functionName: "count" }),
    useIncrement: () => useWriteContract(),
  }
}
// ... one per contract
```

The hook shape is opinionated; users who want raw access import `abis` + `addresses` directly.

## Generation rules

- Files start with `// @generated`. Codegen refuses to overwrite files lacking that header (protection against trashing user-written files).
- ABIs are written even for contracts never deployed, when the user explicitly runs "Regenerate bindings" (so the frontend can be imported before deploy).
- `addresses.ts` keeps all networks the contract has been deployed to. Re-deploying to the same network overwrites that entry.

## Trigger points

1. Successful deploy (auto).
2. Manual "Regenerate bindings" button in Contracts panel.
3. `monad_codegen` MCP tool (lets the AI explicitly refresh after editing ABI shape).
4. Renaming or removing a contract: requires manual "Regenerate" since we don't want to delete bindings on accident.

## Config

`monad.config.json` declares `frontendDir` (default `"frontend"`). If the dir doesn't exist, codegen no-ops with a banner.

## Out of scope

- Solidity event hooks (useWatchContractEvent) — defer to a follow-up; users can write them manually.
- Generating a typed wagmi config (chains array) — Phase 7.
- Generating React Native / non-wagmi consumers — defer.
