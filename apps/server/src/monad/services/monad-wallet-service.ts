import { Context, type Effect } from "effect";

import type { Address } from "@memoize/monad-core";

export interface WalletMetadata {
  readonly id: string;
  readonly address: Address;
  readonly label: string | null;
  readonly source: "burner" | "walletconnect";
  readonly createdAt: string;
}

export interface CreateBurnerWalletOptions {
  readonly label?: string;
}

export interface MonadWalletServiceShape {
  /** Create a new burner wallet. Private key is stored in OS keychain. */
  readonly createBurner: (
    opts?: CreateBurnerWalletOptions,
  ) => Effect.Effect<WalletMetadata, Error>;

  /** List all known wallets (metadata only). */
  readonly list: () => Effect.Effect<readonly WalletMetadata[], Error>;

  /** Get a specific wallet by address. */
  readonly getByAddress: (
    address: Address,
  ) => Effect.Effect<WalletMetadata | null, Error>;

  /**
   * Sign a message with the wallet's private key (fetched from keychain).
   * Never exposes the key.
   */
  readonly signMessage: (
    address: Address,
    message: string,
  ) => Effect.Effect<`0x${string}`, Error>;

  /** Fetch native balance for an address on the current active network. */
  readonly getBalance: (address: Address) => Effect.Effect<bigint, Error>;
}

export class MonadWalletService extends Context.Tag(
  "memoize/MonadWalletService",
)<MonadWalletService, MonadWalletServiceShape>() {}
