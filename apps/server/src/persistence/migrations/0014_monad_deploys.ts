import { SqlClient } from "@effect/sql";
import { Effect } from "effect";

/**
 * Phase 3: Deploy history for contracts.
 */
export const Migration0014MonadDeploys = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    CREATE TABLE IF NOT EXISTS monad_deploys (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      network TEXT NOT NULL,
      contract_name TEXT NOT NULL,
      address TEXT NOT NULL,
      tx_hash TEXT NOT NULL,
      block_number INTEGER,
      constructor_args_json TEXT,
      deployed_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `;

  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_monad_deploys_project ON monad_deploys(project_id)
  `;

  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_monad_deploys_network ON monad_deploys(network)
  `;

  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_monad_deploys_address ON monad_deploys(address)
  `;
});
