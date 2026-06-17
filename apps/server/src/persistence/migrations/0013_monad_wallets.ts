import { SqlClient } from "@effect/sql";
import { Effect } from "effect";

/**
 * Phase 2: Wallet metadata storage.
 *
 * Private keys themselves are NEVER stored here — they live in the OS keychain
 * via keytar (see MonadWalletService). This table only holds public metadata.
 */
export const Migration0013MonadWallets = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    CREATE TABLE IF NOT EXISTS monad_wallets (
      id TEXT PRIMARY KEY,
      address TEXT NOT NULL UNIQUE,
      label TEXT,
      source TEXT NOT NULL CHECK (source IN ('burner', 'walletconnect')),
      project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `;

  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_monad_wallets_address ON monad_wallets(address)
  `;

  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_monad_wallets_project ON monad_wallets(project_id)
  `;
});
