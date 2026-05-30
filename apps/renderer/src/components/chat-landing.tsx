import {
  Check,
  ChevronDown,
  FolderClosed,
  FolderOpen,
  FolderPlus,
  Rocket,
  Send,
  X,
} from "lucide-react";
import { Effect } from "effect";
import { useMemo, useRef, useState } from "react";

import type { FolderId } from "@memoize/wire";

import { cn } from "~/lib/utils";
import { getRpcClient } from "~/lib/rpc-client";
import { Button } from "~/components/ui/button";
import { Card, CardPanel } from "~/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPopup,
  DialogTitle,
} from "~/components/ui/dialog";
import { Frame, FrameFooter } from "~/components/ui/frame";
import {
  Menu,
  MenuItem,
  MenuPopup,
  MenuSeparator,
  MenuTrigger,
} from "~/components/ui/menu";
import {
  Tooltip,
  TooltipPopup,
  TooltipTrigger,
} from "~/components/ui/tooltip";
import { useChatsStore } from "~/store/chats";
import { useSettingsStore } from "~/store/settings";
import { useWorkspaceStore } from "~/store/workspace";
import { ChatCreatingPanel } from "./chat-creating-panel.tsx";
import { ModelPicker } from "./model-picker.tsx";

const SUGGESTIONS: ReadonlyArray<{ label: string }> = [
  { label: "Land targeted provider compatibility rules before the next harness drift" },
  { label: "Bring background activity policy onto main to cut reconnect churn" },
  { label: "Use the new resource history to finish the leak investigation" },
  { label: "Plan the next slice — what should we tackle first?" },
];

const MIN_HEIGHT = 80;
const MAX_HEIGHT = 240;

/**
 * Landing surface shown in the main pane whenever no chat session is
 * selected — including cold start, after archiving the active session, and
 * for fresh users who haven't typed anything yet.
 *
 * Renders a centered "What should we build in <project>?" headline above a
 * mini composer + project picker + starter-prompt list. On submit we call
 * `useChatsStore.create()` with the typed text as `initialPrompt`; the
 * chat store auto-selects the new session, which causes `MainShell` to
 * swap this surface for `<ChatView />` + `<ChatComposer />` on the next
 * render.
 */
/**
 * Cold-start surface. With no project selected the user lands on the empty
 * launch screen (start a new dApp or open an existing project). Once a project
 * is selected, the per-project landing ("What should we build in X?") shows.
 */
export function ChatLanding() {
  const selectedFolderId = useWorkspaceStore((s) => s.selectedFolderId);
  return selectedFolderId === null ? <LaunchScreen /> : <ProjectLanding />;
}

function ProjectLanding() {
  const folders = useWorkspaceStore((s) => s.folders);
  const selectedFolderId = useWorkspaceStore((s) => s.selectedFolderId);
  const selectFolder = useWorkspaceStore((s) => s.select);
  const addFolder = useWorkspaceStore((s) => s.add);

  const defaultProviderId = useSettingsStore((s) => s.defaultProviderId);
  const defaultModelByProvider = useSettingsStore(
    (s) => s.defaultModelByProvider,
  );
  const defaultRuntimeMode = useSettingsStore((s) => s.defaultRuntimeMode);
  const defaultAutoCreateWorktree = useSettingsStore(
    (s) => s.defaultAutoCreateWorktree,
  );

  const create = useChatsStore((s) => s.create);
  const creating = useChatsStore((s) =>
    selectedFolderId !== null ? s.creatingByProject[selectedFolderId] === true : false,
  );

  const [text, setText] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  // Snapshot of the prompt the user just submitted. Drives the
  // ChatCreatingPanel preview so the form can be hidden during the RPC
  // without the user losing visual continuity with what they sent.
  const [pendingPrompt, setPendingPrompt] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const selectedFolder = useMemo(
    () =>
      selectedFolderId === null
        ? null
        : (folders.find((f) => f.id === selectedFolderId) ?? null),
    [folders, selectedFolderId],
  );

  const headline = selectedFolder
    ? `What should we build in ${selectedFolder.name}?`
    : "What should we build today?";

  const onPick = (folderId: FolderId) => {
    void selectFolder(folderId);
  };
  const onAdd = () => {
    void addFolder();
  };

  const canSend =
    text.trim().length > 0 && selectedFolderId !== null && !creating;

  const submit = async (): Promise<void> => {
    if (!canSend || selectedFolderId === null) return;
    const trimmed = text.trim();
    const model = defaultModelByProvider[defaultProviderId];
    setSubmitError(null);
    setPendingPrompt(trimmed);
    const result = await create(selectedFolderId, defaultProviderId, model, {
      initialPrompt: trimmed,
      runtimeMode: defaultRuntimeMode,
    });
    if (result === null) {
      const reason =
        useChatsStore.getState().error ??
        `Couldn't start ${defaultProviderId}. Check that its CLI is installed and signed in.`;
      setSubmitError(reason);
      setPendingPrompt(null);
      return;
    }
    setText("");
    // Don't clear pendingPrompt — the parent will unmount us when the
    // view swaps to ChatView, so the panel keeps animating until then.
  };

  const onSuggest = (prompt: string) => {
    setText(prompt);
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
      const el = textareaRef.current;
      if (el !== null) {
        el.selectionStart = el.value.length;
        el.selectionEnd = el.value.length;
      }
    });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-6 py-10">
      <div className="flex w-full max-w-2xl flex-col gap-6">
        <h1 className="text-center text-xl font-medium text-foreground/90">
          {headline}
        </h1>

        {submitError !== null && (
          <div className="flex items-start gap-2 rounded-lg border border-rose-400/30 bg-rose-500/[0.08] px-3 py-2 text-[12px] text-rose-200">
            <span className="mt-px shrink-0">⚠</span>
            <span className="flex-1 leading-snug">{submitError}</span>
            <button
              type="button"
              onClick={() => setSubmitError(null)}
              aria-label="Dismiss error"
              className="-mr-1 shrink-0 rounded p-0.5 text-rose-200/80 hover:bg-rose-500/[0.12] hover:text-rose-100"
            >
              <X className="size-3.5" />
            </button>
          </div>
        )}

        {creating && pendingPrompt !== null ? (
          <div className="px-1">
            <ChatCreatingPanel
              providerId={defaultProviderId}
              willCreateWorktree={defaultAutoCreateWorktree}
              prompt={pendingPrompt}
            />
          </div>
        ) : (
          <>
            <Frame>
              <Card className="rounded-xl border-border/50">
                <CardPanel className="relative flex flex-col gap-2 px-3 py-2">
                  <textarea
                    ref={textareaRef}
                    value={text}
                    onChange={(e) => {
                      setText(e.target.value);
                      if (submitError !== null) setSubmitError(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        void submit();
                      }
                    }}
                    placeholder={
                      selectedFolder
                        ? "Ask anything. Press Enter to start a new session."
                        : "Pick a project below, then ask anything."
                    }
                    style={{ minHeight: MIN_HEIGHT, maxHeight: MAX_HEIGHT }}
                    className="w-full resize-none bg-transparent text-sm leading-relaxed text-foreground outline-none placeholder:text-muted-foreground"
                  />
                  <div className="flex items-center justify-end">
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <Button
                            variant="default"
                            size="icon-sm"
                            onClick={() => void submit()}
                            disabled={!canSend}
                            aria-label="Send"
                          >
                            <Send className="size-3.5" />
                          </Button>
                        }
                      />
                      <TooltipPopup>
                        {selectedFolderId === null
                          ? "Pick a project to start"
                          : "Send (Enter)"}
                      </TooltipPopup>
                    </Tooltip>
                  </div>
                </CardPanel>
              </Card>
              <FrameFooter className="flex items-center gap-2 px-2 py-1.5 text-[11px] text-muted-foreground">
                <ProjectPicker
                  folders={folders}
                  selectedFolderId={selectedFolderId}
                  selectedName={selectedFolder?.name ?? null}
                  onPick={onPick}
                  onAdd={onAdd}
                />
                <ModelPicker mode="default" />
              </FrameFooter>
            </Frame>

            <ul className="flex flex-col divide-y divide-border/30 overflow-hidden rounded-xl border border-border/30 bg-background/40">
              {SUGGESTIONS.map((s) => (
                <li key={s.label}>
                  <button
                    type="button"
                    onClick={() => onSuggest(s.label)}
                    className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-xs text-foreground/80 hover:bg-muted/40"
                  >
                    <span className="text-muted-foreground">›</span>
                    <span className="truncate">{s.label}</span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}

/** Suggest a kebab-case project name from the user's prompt. */
function suggestName(prompt: string): string {
  const slug = prompt
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .split("-")
    .filter(Boolean)
    .slice(0, 4)
    .join("-");
  return slug.length > 0 ? slug : "my-monad-app";
}

/**
 * Empty/cold-start launch surface. Type what to build, hit Launch → a quick
 * dialog asks name + location → we scaffold the full-stack starter, select it,
 * and start the agent on the prompt in plan mode. Also offers opening an
 * existing project.
 */
function LaunchScreen() {
  const folders = useWorkspaceStore((s) => s.folders);
  const selectFolder = useWorkspaceStore((s) => s.select);
  const addFolder = useWorkspaceStore((s) => s.add);
  const scaffoldFromTemplate = useWorkspaceStore((s) => s.scaffoldFromTemplate);

  const create = useChatsStore((s) => s.create);
  const defaultProviderId = useSettingsStore((s) => s.defaultProviderId);
  const defaultModelByProvider = useSettingsStore(
    (s) => s.defaultModelByProvider,
  );
  const defaultRuntimeMode = useSettingsStore((s) => s.defaultRuntimeMode);

  const [prompt, setPrompt] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState("");
  const [parentDir, setParentDir] = useState<string | null>(null);
  const [launching, setLaunching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const promptReady = prompt.trim().length > 0;

  const openDialog = () => {
    if (!promptReady) return;
    setName(suggestName(prompt));
    setError(null);
    setDialogOpen(true);
  };

  const chooseLocation = async (): Promise<void> => {
    try {
      const client = await getRpcClient();
      const dir = await Effect.runPromise(client.workspace.pickFolder({}));
      if (dir !== null) setParentDir(dir);
    } catch {
      // picker dismissed / unavailable — leave the current choice
    }
  };

  const launch = async (): Promise<void> => {
    const trimmedName = name.trim();
    if (trimmedName.length === 0 || parentDir === null || launching) return;
    setLaunching(true);
    setError(null);

    const folder = await scaffoldFromTemplate(trimmedName, parentDir);
    if (folder === null) {
      setError(
        useWorkspaceStore.getState().error ?? "Couldn't create the project.",
      );
      setLaunching(false);
      return;
    }

    const model = defaultModelByProvider[defaultProviderId];
    const result = await create(folder.id, defaultProviderId, model, {
      initialPrompt: prompt.trim(),
      runtimeMode: defaultRuntimeMode,
      permissionMode: "plan",
    });
    if (result === null) {
      setError(
        useChatsStore.getState().error ??
        `Project created, but couldn't start ${defaultProviderId}. Check its CLI is installed and signed in.`,
      );
      setLaunching(false);
      return;
    }
    // Success — MainShell swaps to ChatView (a session is now selected); this
    // surface unmounts, so we leave `launching` set.
    setDialogOpen(false);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col px-6 py-6">
      <div className="mx-auto justify-center flex min-h-0 w-full max-w-5xl flex-1 flex-col gap-4">
        <div className="flex flex-col items-center gap-1.5 pt-2 text-center">
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">
            Launch a Monad dApp
          </h1>
          <p className="text-sm text-muted-foreground">
            Describe what you want to build. We'll scaffold a full-stack starter
            and the agent plans it with you.
          </p>
        </div>
          <Card className="flex min-h-0 flex-1 flex-col rounded-xl border-border/50 max-h-60">
            <CardPanel className="relative flex min-h-0 flex-1 flex-col gap-3 px-4 py-3">
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    openDialog();
                  }
                }}
                placeholder="e.g. an NFT mint with a gallery and a holders leaderboard"
                className="min-h-0  w-full flex-1 resize-none bg-transparent text-base leading-relaxed text-foreground outline-none placeholder:text-muted-foreground"
              />
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center rounded-md bg-primary/15 px-2 py-1 text-[11px] font-medium text-primary">
                  Full Stack dApp
                </span>
                <Button onClick={openDialog} disabled={!promptReady}>
                  <Rocket className="size-3.5" />
                  Launch
                </Button>
              </div>
            </CardPanel>
          </Card>
          <div className="flex items-center justify-start gap-2 pb-1 text-[11px] text-muted-foreground">
            <span>or open an existing project</span>
            <ProjectPicker
              folders={folders}
              selectedFolderId={null}
              selectedName={null}
              onPick={(id) => void selectFolder(id)}
              onAdd={() => void addFolder()}
            />
          </div>
      </div>

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          if (!launching) setDialogOpen(open);
        }}
      >
        <DialogPopup className="max-w-md">
          <DialogHeader>
            <DialogTitle>Name your dApp</DialogTitle>
            <DialogDescription>
              We'll create a full-stack Monad starter, then the agent starts
              planning.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4 px-6 pb-2">
            <label className="flex flex-col gap-1.5">
              <span className="text-xs text-muted-foreground">App name</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="my-monad-app"
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
            </label>
            <div className="flex flex-col gap-1.5">
              <span className="text-xs text-muted-foreground">Location</span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void chooseLocation()}
                >
                  <FolderOpen className="size-3.5" />
                  Choose folder
                </Button>
                <span
                  className="min-w-0 flex-1 truncate text-xs text-muted-foreground"
                  title={parentDir ?? undefined}
                >
                  {parentDir ?? "No folder chosen"}
                </span>
              </div>
            </div>
            {error !== null && (
              <p className="rounded-md border border-rose-400/30 bg-rose-500/[0.08] px-3 py-2 text-[12px] text-rose-200">
                {error}
              </p>
            )}
          </div>
          <DialogFooter>
            <DialogClose render={<Button variant="ghost" disabled={launching} />}>
              Cancel
            </DialogClose>
            <Button
              onClick={() => void launch()}
              disabled={launching || name.trim().length === 0 || parentDir === null}
            >
              {launching ? "Creating…" : "Create & start"}
            </Button>
          </DialogFooter>
        </DialogPopup>
      </Dialog>
    </div>
  );
}

function ProjectPicker({
  folders,
  selectedFolderId,
  selectedName,
  onPick,
  onAdd,
}: {
  folders: ReturnType<typeof useWorkspaceStore.getState>["folders"];
  selectedFolderId: FolderId | null;
  selectedName: string | null;
  onPick: (folderId: FolderId) => void;
  onAdd: () => void;
}) {
  return (
    <Menu>
      <MenuTrigger
        className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] text-foreground hover:bg-muted/60 data-[popup-open]:bg-muted/60"
        aria-label="Pick a project"
      >
        <FolderClosed className="size-3.5" />
        <span>{selectedName ?? "Pick a project"}</span>
        <ChevronDown className="size-3 opacity-60" />
      </MenuTrigger>
      <MenuPopup side="top" align="start" className="w-64 p-1">
        {folders.length === 0 ? (
          <div className="px-2 py-1.5 text-xs text-muted-foreground">
            No projects yet.
          </div>
        ) : (
          folders.map((folder) => {
            const active = folder.id === selectedFolderId;
            return (
              <MenuItem
                key={folder.id}
                onClick={() => onPick(folder.id)}
                className={cn(
                  "grid grid-cols-[1rem_auto_1fr] items-center gap-x-2 rounded-md px-2 py-1.5 text-sm",
                  active
                    ? "bg-accent/40 text-accent-foreground data-highlighted:bg-accent/60"
                    : undefined,
                )}
              >
                <span className="col-start-1 row-start-1 flex items-center justify-center">
                  {active && <Check className="size-3.5 opacity-90" />}
                </span>
                <FolderClosed className="col-start-2 row-start-1 size-3.5 opacity-80" />
                <span className="col-start-3 row-start-1 truncate">
                  {folder.name}
                </span>
              </MenuItem>
            );
          })
        )}
        <MenuSeparator />
        <MenuItem
          onClick={onAdd}
          className="grid grid-cols-[1rem_auto_1fr] items-center gap-x-2 rounded-md px-2 py-1.5 text-sm"
        >
          <span className="col-start-1 row-start-1" />
          <FolderPlus className="col-start-2 row-start-1 size-3.5 opacity-80" />
          <span className="col-start-3 row-start-1">Add new project</span>
        </MenuItem>
      </MenuPopup>
    </Menu>
  );
}
