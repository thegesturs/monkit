# Feature: Contracts (Foundry integration)

## Why

Compiling Solidity is the bottleneck for vibe coding — error messages are noisy, paths are tricky, ABIs are awkward to extract. We wrap `forge build`, surface errors in a way the AI can act on, and produce ABIs the deploy/codegen layers consume.

## Toolchain choice

Foundry (`forge`). See [decisions/0003-foundry-vs-hardhat.md](../decisions/0003-foundry-vs-hardhat.md).

## Compile flow

1. User clicks **Compile** in the Contracts panel, or AI calls `monad_deploy` (which compiles first).
2. `monad-core/compile.ts` runs `forge build --json` via PTY in the project root.
3. Stdout JSON parsed; warnings/errors collected.
4. Errors are converted to **composer @-file mentions** with `file:line:column` so the active AI agent can be one-click prompted to fix them.
5. Artifacts at `out/<Contract>.sol/<Contract>.json` are parsed for ABI + bytecode and cached.

## Watch mode

When Monad mode is active, `forge build --watch` is OFF by default (heavy). User can enable in settings. Instead, we re-compile on Deploy click.

## ABI extraction

`monad-core/abi.ts` reads the Foundry artifact JSON and exposes:

```ts
interface ContractArtifact {
  name: string
  abi: AbiItem[]
  bytecode: Hex
  deployedBytecode: Hex
  source: { file: string, line: number }
  constructor?: AbiFunction
  functions: { reads: AbiFunction[], writes: AbiFunction[] }
  events: AbiEvent[]
}
```

Classification of read vs. write is based on `stateMutability ∈ {view, pure}` → read; otherwise write.

## Contracts panel UX

- List of all compiled contracts in the project, grouped by source file.
- Per contract: ABI summary, last-deployed address per network, "Deploy" button, "Open source" link.
- Compile button at the top with a status chip ("Compiled 3s ago" / "Errors: 2 — click to view").

## forge install

If the project lacks `lib/forge-std`, the first compile attempt fails. We surface a banner with one-click `forge install foundry-rs/forge-std`.

## Out of scope

- Hardhat support — defer.
- Vyper / other compilers — defer.
- Bytecode-level diff between deploys — defer.
- forge test runner UI (still usable via terminal, no first-class surface in 0.05).
