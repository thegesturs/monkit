import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { type Address } from "./schema.js";

/**
 * Phase 2: Pure wallet generation logic.
 *
 * Private keys are generated here but **never** persisted or transmitted
 * by monad-core itself. Storage is the responsibility of the host
 * (apps/server uses OS keychain via keytar).
 */

export interface GeneratedBurnerWallet {
  readonly address: Address;
  readonly privateKey: `0x${string}`;
}

/**
 * Generates a new burner wallet using viem.
 * The caller is responsible for secure storage of the private key.
 */
export function generateBurnerWallet(): GeneratedBurnerWallet {
  const privateKey = generatePrivateKey();
  const account = privateKeyToAccount(privateKey);

  return {
    address: account.address as Address,
    privateKey,
  };
}

/**
 * Creates an account object from a private key (for signing).
 * This is a thin wrapper around viem's privateKeyToAccount.
 */
export function privateKeyToViemAccount(privateKey: `0x${string}`) {
  return privateKeyToAccount(privateKey);
}
