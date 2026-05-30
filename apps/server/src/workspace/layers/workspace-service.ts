import { FileSystem } from "@effect/platform";
import { SqlClient } from "@effect/sql";
import { Effect, Layer } from "effect";
import * as fsp from "node:fs/promises";
import * as fsSync from "node:fs";
import * as os from "node:os";
import * as Path from "node:path";
import { fileURLToPath } from "node:url";

import {
  Folder,
  FolderId,
  WorkspaceDuplicatePathError,
  WorkspaceInvalidPathError,
  WorkspaceNotFoundError,
  WorkspaceScaffoldError,
} from "@memoize/wire";

import { IndexRegistry } from "../../code-index/services/index-registry.ts";
import { WorkspaceService } from "../services/workspace-service.ts";

interface ProjectRow {
  readonly id: string;
  readonly path: string;
  readonly name: string;
  readonly created_at: string;
}

const rowToFolder = (row: ProjectRow): Folder =>
  Folder.make({
    id: FolderId.make(row.id),
    path: row.path,
    name: row.name,
    addedAt: new Date(row.created_at),
  });

const SELECTED_KEY = "selectedProjectId";

// Directory/file names never copied when scaffolding a template — build
// artifacts and VCS metadata that a clean checkout wouldn't carry but a
// dev machine that ran the template will.
const SCAFFOLD_SKIP = new Set([
  "node_modules",
  ".git",
  "dist",
  "out",
  "cache",
  "broadcast",
  ".DS_Store",
]);

/**
 * Locate the bundled `templates/` directory. Checks an env override, then a
 * few cwd-relative candidates, then walks up from this module's location —
 * covering `bun` dev runs and transpiled layouts. Returns null if not found
 * (e.g. a packaged build that didn't bundle templates — a packaging follow-up).
 */
const resolveTemplatesDir = (template: string): string | null => {
  const candidates: string[] = [];
  if (process.env.MEMOIZE_TEMPLATES_DIR) {
    candidates.push(process.env.MEMOIZE_TEMPLATES_DIR);
  }
  const cwd = process.cwd();
  for (let up = 0; up <= 3; up++) {
    candidates.push(Path.join(cwd, ...Array(up).fill(".."), "templates"));
  }
  try {
    const here = Path.dirname(fileURLToPath(import.meta.url));
    for (let up = 1; up <= 7; up++) {
      candidates.push(Path.join(here, ...Array(up).fill(".."), "templates"));
    }
  } catch {
    // import.meta.url unavailable in this runtime — cwd candidates cover dev.
  }
  for (const root of candidates) {
    try {
      if (fsSync.existsSync(Path.join(root, template))) return root;
    } catch {
      // unreadable candidate — try the next one
    }
  }
  return null;
};

export const WorkspaceServiceLive = Layer.effect(
  WorkspaceService,
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const fs = yield* FileSystem.FileSystem;
    const indexRegistry = yield* IndexRegistry;

    // Kick off (or no-op into) the per-workspace code index. Fire-and-forget:
    // the RPC returns immediately and the renderer learns about progress via
    // `index.statusStream`. Errors are swallowed at this layer — the index
    // surface reports its own state through the stream.
    const triggerIndex = (path: string): Effect.Effect<void> =>
      Effect.gen(function* () {
        const handle = yield* indexRegistry.getHandle(path, "HEAD");
        yield* Effect.forkDaemon(
          Effect.tryPromise({
            try: () => handle.ensureIndexed(),
            catch: (cause) => new Error(`ensureIndexed failed: ${String(cause)}`),
          }).pipe(Effect.ignore),
        );
      });

    const list: WorkspaceService["Type"]["list"] = () =>
      Effect.gen(function* () {
        const rows = yield* sql<ProjectRow>`
          SELECT id, path, name, created_at
          FROM projects
          ORDER BY created_at ASC
        `.pipe(Effect.orDie);
        return rows.map(rowToFolder);
      });

    const findById: WorkspaceService["Type"]["findById"] = (folderId) =>
      Effect.gen(function* () {
        const rows = yield* sql<ProjectRow>`
          SELECT id, path, name, created_at
          FROM projects
          WHERE id = ${folderId}
          LIMIT 1
        `.pipe(Effect.orDie);
        return rows.length > 0 ? rowToFolder(rows[0]!) : null;
      });

    // Dup-check + insert a resolved directory as a project, kick its index,
    // and return the Folder. Shared by `add` and `scaffoldTemplate`.
    const insertProject = (
      resolved: string,
    ): Effect.Effect<Folder, WorkspaceDuplicatePathError> =>
      Effect.gen(function* () {
        const dupes = yield* sql<{ id: string }>`
          SELECT id FROM projects WHERE path = ${resolved} LIMIT 1
        `.pipe(Effect.orDie);
        if (dupes.length > 0) {
          return yield* Effect.fail(
            new WorkspaceDuplicatePathError({ path: resolved }),
          );
        }

        const id = FolderId.make(crypto.randomUUID());
        const name = Path.basename(resolved) || resolved;
        const now = new Date();
        const nowIso = now.toISOString();

        yield* sql`
          INSERT INTO projects (id, path, name, created_at, updated_at)
          VALUES (${id}, ${resolved}, ${name}, ${nowIso}, ${nowIso})
        `.pipe(Effect.orDie);

        yield* triggerIndex(resolved);

        return Folder.make({ id, path: resolved, name, addedAt: now });
      });

    const add: WorkspaceService["Type"]["add"] = (rawPath) =>
      Effect.gen(function* () {
        const resolved = Path.resolve(rawPath);

        const stat = yield* fs.stat(resolved).pipe(
          Effect.mapError(
            () =>
              new WorkspaceInvalidPathError({
                path: resolved,
                reason: "path does not exist",
              }),
          ),
        );
        if (stat.type !== "Directory") {
          return yield* Effect.fail(
            new WorkspaceInvalidPathError({
              path: resolved,
              reason: "path is not a directory",
            }),
          );
        }

        return yield* insertProject(resolved);
      });

    const scaffoldTemplate: WorkspaceService["Type"]["scaffoldTemplate"] = ({
      template,
      name,
      parentDir,
    }) =>
      Effect.gen(function* () {
        const safeName = name.trim();
        if (safeName.length === 0) {
          return yield* Effect.fail(
            new WorkspaceScaffoldError({ reason: "project name is empty" }),
          );
        }

        const templatesRoot = resolveTemplatesDir(template);
        if (templatesRoot === null) {
          return yield* Effect.fail(
            new WorkspaceScaffoldError({
              reason: "could not locate the templates directory",
            }),
          );
        }
        const src = Path.join(templatesRoot, template);

        const parent = parentDir
          ? Path.resolve(parentDir)
          : Path.join(os.homedir(), "MonadApps");
        const dest = Path.join(parent, safeName);

        const exists = yield* fs.exists(dest).pipe(Effect.orDie);
        if (exists) {
          return yield* Effect.fail(
            new WorkspaceInvalidPathError({
              path: dest,
              reason: "a folder with that name already exists here",
            }),
          );
        }

        yield* fs
          .makeDirectory(parent, { recursive: true })
          .pipe(Effect.ignore);

        yield* Effect.tryPromise({
          try: () =>
            fsp.cp(src, dest, {
              recursive: true,
              filter: (source) => {
                if (SCAFFOLD_SKIP.has(Path.basename(source))) return false;
                // Foundry deps (forge-std) reinstall on first build; basename
                // "lib" would collide with frontend/src/lib, so match the path.
                if (source.endsWith(Path.join("contracts", "lib"))) return false;
                return true;
              },
            }),
          catch: (cause) =>
            new WorkspaceScaffoldError({
              reason: `failed to copy template: ${String(cause)}`,
            }),
        });

        return yield* insertProject(dest);
      });

    const remove: WorkspaceService["Type"]["remove"] = (folderId) =>
      Effect.gen(function* () {
        const existing = yield* sql<{ id: string }>`
          SELECT id FROM projects WHERE id = ${folderId} LIMIT 1
        `.pipe(Effect.orDie);
        if (existing.length === 0) {
          return yield* Effect.fail(
            new WorkspaceNotFoundError({ folderId }),
          );
        }
        yield* sql`DELETE FROM projects WHERE id = ${folderId}`.pipe(
          Effect.orDie,
        );
        // ON DELETE CASCADE on projects → sessions → messages handles the rest.
        // If this was the selected project, clear the pointer so the persisted
        // value never points to a missing id.
        yield* sql`
          DELETE FROM app_state
          WHERE key = ${SELECTED_KEY} AND value = ${folderId}
        `.pipe(Effect.orDie);
      });

    const getSelected: WorkspaceService["Type"]["getSelected"] = () =>
      Effect.gen(function* () {
        const rows = yield* sql<{ value: string }>`
          SELECT value FROM app_state WHERE key = ${SELECTED_KEY} LIMIT 1
        `.pipe(Effect.orDie);
        if (rows.length === 0) return null;
        const id = FolderId.make(rows[0]!.value);
        // Defensive: drop the selection if the project is gone.
        const known = yield* sql<{ id: string }>`
          SELECT id FROM projects WHERE id = ${id} LIMIT 1
        `.pipe(Effect.orDie);
        return known.length > 0 ? id : null;
      });

    const setSelected: WorkspaceService["Type"]["setSelected"] = (folderId) =>
      Effect.gen(function* () {
        if (folderId === null) {
          yield* sql`DELETE FROM app_state WHERE key = ${SELECTED_KEY}`.pipe(
            Effect.orDie,
          );
          return;
        }
        const known = yield* sql<{ id: string }>`
          SELECT id FROM projects WHERE id = ${folderId} LIMIT 1
        `.pipe(Effect.orDie);
        if (known.length === 0) {
          yield* sql`DELETE FROM app_state WHERE key = ${SELECTED_KEY}`.pipe(
            Effect.orDie,
          );
          return;
        }
        yield* sql`
          INSERT INTO app_state (key, value) VALUES (${SELECTED_KEY}, ${folderId})
          ON CONFLICT(key) DO UPDATE SET value = excluded.value
        `.pipe(Effect.orDie);

        // Resolve to the folder's path and kick off (or no-op) its index.
        const rows = yield* sql<{ path: string }>`
          SELECT path FROM projects WHERE id = ${folderId} LIMIT 1
        `.pipe(Effect.orDie);
        if (rows.length > 0) {
          yield* triggerIndex(rows[0]!.path);
        }
      });

    return {
      add,
      scaffoldTemplate,
      list,
      remove,
      getSelected,
      setSelected,
      findById,
    } as const;
  }),
);
