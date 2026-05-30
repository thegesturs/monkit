import { Rpc } from "@effect/rpc";
import { Schema } from "effect";

import { FsFolderNotFoundError } from "./fs.ts";
import { FolderId, WorktreeId } from "./ids.ts";

export class Folder extends Schema.Class<Folder>("Folder")({
  id: FolderId,
  path: Schema.String,
  name: Schema.String,
  addedAt: Schema.DateFromString,
}) {}

export class WorkspaceDuplicatePathError extends Schema.TaggedError<WorkspaceDuplicatePathError>()(
  "WorkspaceDuplicatePathError",
  { path: Schema.String },
) {}

export class WorkspaceNotFoundError extends Schema.TaggedError<WorkspaceNotFoundError>()(
  "WorkspaceNotFoundError",
  { folderId: FolderId },
) {}

export class WorkspaceInvalidPathError extends Schema.TaggedError<WorkspaceInvalidPathError>()(
  "WorkspaceInvalidPathError",
  { path: Schema.String, reason: Schema.String },
) {}

/**
 * Available starter templates the agent scaffolds from. One bare general-purpose
 * full-stack starter for now; a single-member union is intentional — adding a
 * second general starter later is an additive change here + a new `templates/` dir.
 */
export const TemplateId = Schema.Literal("fullstack-monad-convex");
export type TemplateId = typeof TemplateId.Type;

export class WorkspaceScaffoldError extends Schema.TaggedError<WorkspaceScaffoldError>()(
  "WorkspaceScaffoldError",
  { reason: Schema.String },
) {}

export const WorkspaceAddRpc = Rpc.make("workspace.add", {
  payload: Schema.Struct({ path: Schema.String }),
  success: Folder,
  error: Schema.Union(WorkspaceDuplicatePathError, WorkspaceInvalidPathError),
});

/**
 * Scaffold a new project from a bundled starter template: copy the template
 * tree into `parentDir/name`, register it as a project, and return the Folder.
 * `parentDir` defaults server-side when omitted.
 */
export const WorkspaceScaffoldTemplateRpc = Rpc.make("workspace.scaffoldTemplate", {
  payload: Schema.Struct({
    template: TemplateId,
    name: Schema.String,
    parentDir: Schema.optional(Schema.String),
  }),
  success: Folder,
  error: Schema.Union(
    WorkspaceScaffoldError,
    WorkspaceDuplicatePathError,
    WorkspaceInvalidPathError,
  ),
});

export const WorkspaceListRpc = Rpc.make("workspace.list", {
  payload: Schema.Struct({}),
  success: Schema.Array(Folder),
});

export const WorkspaceRemoveRpc = Rpc.make("workspace.remove", {
  payload: Schema.Struct({ folderId: FolderId }),
  success: Schema.Void,
  error: WorkspaceNotFoundError,
});

export const WorkspacePickFolderRpc = Rpc.make("workspace.pickFolder", {
  payload: Schema.Struct({}),
  success: Schema.NullOr(Schema.String),
});

export const WorkspaceGetSelectedRpc = Rpc.make("workspace.getSelected", {
  payload: Schema.Struct({}),
  success: Schema.NullOr(FolderId),
});

export const WorkspaceSetSelectedRpc = Rpc.make("workspace.setSelected", {
  payload: Schema.Struct({ folderId: Schema.NullOr(FolderId) }),
  success: Schema.Void,
});

/**
 * Walk the project's file tree honouring `.gitignore` and return up to
 * `limit` matches against `query`. Backs the composer's `@` file picker.
 * Empty `query` returns the most recently touched entries (server's call).
 *
 * When `worktreeId` is set the walk is rooted at the worktree's path instead
 * of the project's main checkout, so a session running on a worktree only
 * surfaces files that actually live in that worktree. Mirrors the optional
 * `worktreeId` on the `fs.*` RPCs; the server falls back to the project root
 * silently if the worktree doesn't belong to `projectId`.
 */
export const WorkspaceSearchFilesRpc = Rpc.make("workspace.searchFiles", {
  payload: Schema.Struct({
    projectId: FolderId,
    query: Schema.String,
    limit: Schema.optional(Schema.Number),
    worktreeId: Schema.optional(Schema.NullOr(WorktreeId)),
  }),
  success: Schema.Array(
    Schema.Struct({
      relPath: Schema.String,
      absPath: Schema.String,
      kind: Schema.Literal("file", "directory"),
    }),
  ),
  error: FsFolderNotFoundError,
});
