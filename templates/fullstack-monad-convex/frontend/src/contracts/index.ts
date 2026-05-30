import { addresses } from "./addresses";

export { addresses } from "./addresses";
export * from "./abis";

/** Resolve a deployed contract address for the active chain, if any. */
export function getAddress(
  name: string,
  chainId: number,
): `0x${string}` | undefined {
  return addresses[chainId]?.[name];
}
