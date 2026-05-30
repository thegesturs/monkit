import { Context, type Effect } from "effect";

import {
  type Folder,
  type FolderId,
  type TemplateId,
  type WorkspaceDuplicatePathError,
  type WorkspaceInvalidPathError,
  type WorkspaceNotFoundError,
  type WorkspaceScaffoldError,
} from "@memoize/wire";

export interface WorkspaceServiceShape {
  readonly add: (
    path: string,
  ) => Effect.Effect<
    Folder,
    WorkspaceDuplicatePathError | WorkspaceInvalidPathError
  >;
  /**
   * Scaffold a new project from a bundled starter template into
   * `parentDir/name` (parentDir defaults when omitted), register it, and
   * return the Folder.
   */
  readonly scaffoldTemplate: (input: {
    readonly template: TemplateId;
    readonly name: string;
    readonly parentDir?: string | undefined;
  }) => Effect.Effect<
    Folder,
    | WorkspaceScaffoldError
    | WorkspaceDuplicatePathError
    | WorkspaceInvalidPathError
  >;
  readonly list: () => Effect.Effect<ReadonlyArray<Folder>>;
  readonly remove: (
    folderId: FolderId,
  ) => Effect.Effect<void, WorkspaceNotFoundError>;
  readonly getSelected: () => Effect.Effect<FolderId | null>;
  readonly setSelected: (
    folderId: FolderId | null,
  ) => Effect.Effect<void>;
  readonly findById: (
    folderId: FolderId,
  ) => Effect.Effect<Folder | null>;
}

export class WorkspaceService extends Context.Tag("memoize/WorkspaceService")<
  WorkspaceService,
  WorkspaceServiceShape
>() {}
