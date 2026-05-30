import { Effect } from "effect";
import { create } from "zustand";

import type { Folder, FolderId } from "@memoize/wire";

import { getRpcClient } from "../lib/rpc-client.ts";

type WorkspaceState = {
  folders: ReadonlyArray<Folder>;
  selectedFolderId: FolderId | null;
  loading: boolean;
  error: string | null;
  load: () => Promise<void>;
  add: () => Promise<void>;
  scaffoldFromTemplate: (name: string) => Promise<void>;
  remove: (folderId: FolderId) => Promise<void>;
  select: (folderId: FolderId) => Promise<void>;
};

const persistSelection = async (folderId: FolderId | null): Promise<void> => {
  try {
    const client = await getRpcClient();
    await Effect.runPromise(client.workspace.setSelected({ folderId }));
  } catch {
    // best-effort persistence; the in-memory store already updated
  }
};

const formatError = (err: unknown): string => {
  if (err instanceof Error) return err.message;
  if (typeof err === "object" && err !== null && "_tag" in err) {
    return String((err as { _tag: unknown })._tag);
  }
  return String(err);
};

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  folders: [],
  selectedFolderId: null,
  loading: false,
  error: null,
  load: async () => {
    set({ loading: true, error: null });
    try {
      const client = await getRpcClient();
      const folders = await Effect.runPromise(client.workspace.list({}));
      // Start with NO project selected — the app opens on the empty launch
      // surface so the user starts directly, rather than jumping into a repo.
      // Selection happens by explicit user action (sidebar / launch flow).
      set({ folders, selectedFolderId: null, loading: false });
    } catch (err) {
      set({ error: formatError(err), loading: false });
    }
  },
  add: async () => {
    set({ error: null });
    try {
      const client = await getRpcClient();
      const path = await Effect.runPromise(client.workspace.pickFolder({}));
      if (path === null) return;
      const folder = await Effect.runPromise(client.workspace.add({ path }));
      set((s) => ({
        folders: [...s.folders, folder],
        selectedFolderId: folder.id,
      }));
      await persistSelection(folder.id);
    } catch (err) {
      set({ error: formatError(err) });
    }
  },
  scaffoldFromTemplate: async (name) => {
    set({ error: null });
    try {
      const client = await getRpcClient();
      // Pick the parent directory; the template is created as `parentDir/name`.
      const parentDir = await Effect.runPromise(client.workspace.pickFolder({}));
      if (parentDir === null) return;
      const folder = await Effect.runPromise(
        client.workspace.scaffoldTemplate({
          template: "fullstack-monad-convex",
          name,
          parentDir,
        }),
      );
      set((s) => ({
        folders: [...s.folders, folder],
        selectedFolderId: folder.id,
      }));
      await persistSelection(folder.id);
    } catch (err) {
      set({ error: formatError(err) });
    }
  },
  remove: async (folderId) => {
    set({ error: null });
    try {
      const client = await getRpcClient();
      await Effect.runPromise(client.workspace.remove({ folderId }));
      const nextSelected = (() => {
        const s = get();
        const folders = s.folders.filter((f) => f.id !== folderId);
        const selectedFolderId =
          s.selectedFolderId === folderId
            ? (folders[0]?.id ?? null)
            : s.selectedFolderId;
        set({ folders, selectedFolderId });
        return { selectedFolderId, changed: s.selectedFolderId === folderId };
      })();
      if (nextSelected.changed) await persistSelection(nextSelected.selectedFolderId);
    } catch (err) {
      set({ error: formatError(err) });
    }
  },
  select: async (folderId) => {
    if (get().selectedFolderId === folderId) return;
    set({ selectedFolderId: folderId });
    await persistSelection(folderId);
  },
}));
