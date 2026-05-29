import keytar from "keytar";
import { Effect, Layer } from "effect";
import { generateBurnerWallet, privateKeyToViemAccount } from "@memoize/monad-core";
import { SqlClient } from "@effect/sql";

import { MonadWalletService, type WalletMetadata } from "../services/monad-wallet-service.ts";
import { MonadCore } from "../layer.ts";

const SERVICE_NAME = "memoize";
const keychainAccountFor = (address: string) => `monad.wallet:${address}`;

const tryKeychain = <A>(thunk: () => Promise<A>) =>
  Effect.tryPromise({
    try: thunk,
    catch: (cause) => new Error(String(cause)),
  });

export const MonadWalletServiceLive = Layer.effect(
  MonadWalletService,
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const monadCore = yield* MonadCore;

    const createBurner = (opts?: { label?: string }) =>
      Effect.gen(function* () {
        const { address, privateKey } = generateBurnerWallet();
        const id = crypto.randomUUID();
        const now = new Date().toISOString();
        const label = opts?.label ?? null;

        // 1. Persist metadata
        yield* sql`
          INSERT INTO monad_wallets (id, address, label, source, created_at)
          VALUES (${id}, ${address}, ${label}, 'burner', ${now})
        `;

        // 2. Store private key in OS keychain (never in DB)
        yield* tryKeychain(() =>
          keytar.setPassword(SERVICE_NAME, keychainAccountFor(address), privateKey),
        );

        return {
          id,
          address,
          label,
          source: "burner" as const,
          createdAt: now,
        } satisfies WalletMetadata;
      });

    const list = () =>
      Effect.gen(function* () {
        const rows = yield* sql<WalletMetadata>`
          SELECT id, address, label, source, created_at as createdAt
          FROM monad_wallets
          ORDER BY created_at DESC
        `;
        return rows;
      });

    const getByAddress = (address: string) =>
      Effect.gen(function* () {
        const rows = yield* sql<WalletMetadata>`
          SELECT id, address, label, source, created_at as createdAt
          FROM monad_wallets
          WHERE address = ${address}
          LIMIT 1
        `;
        return rows[0] ?? null;
      });

    const signMessage = (address: string, message: string) =>
      Effect.gen(function* () {
        const pk = yield* tryKeychain(() =>
          keytar.getPassword(SERVICE_NAME, keychainAccountFor(address)),
        );

        if (!pk) {
          return yield* Effect.fail(new Error(`No private key found for wallet ${address}`));
        }

        const account = privateKeyToViemAccount(pk as `0x${string}`);
        return yield* Effect.tryPromise(() => account.signMessage({ message }));
      });

    const getBalance = (address: string) =>
      Effect.gen(function* () {
        const client = monadCore.getPublicClient();
        return yield* Effect.tryPromise(() =>
          client.getBalance({ address: address as `0x${string}` }),
        );
      });

    return {
      createBurner,
      list,
      getByAddress,
      signMessage,
      getBalance,
    };
  }),
);