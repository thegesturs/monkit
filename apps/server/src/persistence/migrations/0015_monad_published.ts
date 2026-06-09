import { SqlClient } from "@effect/sql";
import { Effect } from "effect";

/**
 * Phase 6: the published (shareable) app URL per project. One row per project —
 * the latest cloud deploy's public production URL, persisted so the share box
 * survives reloads.
 */
export const Migration0015MonadPublished = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    CREATE TABLE monad_published (
      project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
      url TEXT NOT NULL,
      deployment_url TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `;
});
