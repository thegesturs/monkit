// @generated — the deploy flow overwrites this file. Safe to read, don't hand-edit.
// Seeded with the starter Counter ABI so the app compiles before the first deploy.

export const COUNTER_ABI = [
  {
    type: "function",
    name: "count",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "increment",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [],
  },
  {
    type: "function",
    name: "setNumber",
    stateMutability: "nonpayable",
    inputs: [{ name: "newCount", type: "uint256" }],
    outputs: [],
  },
  {
    type: "event",
    name: "Incremented",
    inputs: [
      { name: "by", type: "address", indexed: true },
      { name: "newCount", type: "uint256", indexed: false },
    ],
    anonymous: false,
  },
] as const;
