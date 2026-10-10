import { useEffect, useMemo, useRef, useState } from "react";
import {
  DndContext,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  definePluginApp,
  experimental_useSidebarThreadActions,
  experimental_useSidebarThreadSplit,
  experimental_useSidebarThreads,
  type PluginSidebarThread,
  type PluginThreadListProps,
  useRpc,
} from "@get-bb/plugin-sdk/app";
import type { rpcContract } from "./server";
import { toast } from "sonner";
import { Button } from "./components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./components/ui/dialog";

async function copyThreadId(threadId: string) {
  try {
    await navigator.clipboard.writeText(threadId);
  } catch {
    window.prompt("Copy thread ID", threadId);
  }
}

function BranchIcon() {
  return (
    <svg
      aria-hidden="true"
      className="size-3 shrink-0"
      fill="none"
      viewBox="0 0 16 16"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="4" cy="3" r="1.5" />
      <circle cx="4" cy="13" r="1.5" />
      <circle cx="12" cy="5" r="1.5" />
      <path d="M4 4.5v7M10.5 5H9a5 5 0 0 0-5 5" />
    </svg>
  );
}

function PinIcon({ filled = false }: { filled?: boolean }) {
  return (
    <svg
      aria-hidden="true"
      className="size-3.5"
      fill={filled ? "currentColor" : "none"}
      viewBox="0 0 16 16"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m10.5 2.5 3 3-2 1.25-.5 3.5-1.1 1.1-5.25-5.25 1.1-1.1 3.5-.5 1.25-2Z" />
      <path d="m6.4 9.6-3.9 3.9M2.5 13.5l1-1" />
    </svg>
  );
}

function MoreIcon() {
  return (
    <svg aria-hidden="true" className="size-4" viewBox="0 0 16 16" fill="currentColor">
      <circle cx="3" cy="8" r="1.25" />
      <circle cx="8" cy="8" r="1.25" />
      <circle cx="13" cy="8" r="1.25" />
    </svg>
  );
}

function NewThreadIcon() {
  return (
    <svg
      aria-hidden="true"
      className="size-3.5"
      fill="none"
      viewBox="0 0 16 16"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 3.5h7.5A1.5 1.5 0 0 1 12 5v4a1.5 1.5 0 0 1-1.5 1.5H7L4 13v-2.5H3A1.5 1.5 0 0 1 1.5 9V5A1.5 1.5 0 0 1 3 3.5Z" />
      <path d="M12.5 1.5v4M10.5 3.5h4" />
    </svg>
  );
}

function NewProjectIcon() {
  return (
    <svg
      aria-hidden="true"
      className="size-3.5"
      fill="none"
      viewBox="0 0 16 16"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M1.75 4.25A1.5 1.5 0 0 1 3.25 2.75h3l1.5 1.5h5A1.5 1.5 0 0 1 14.25 5.75v5A1.5 1.5 0 0 1 12.75 12.25h-9.5a1.5 1.5 0 0 1-1.5-1.5v-6.5Z" />
      <path d="M8 7v3M6.5 8.5h3" />
    </svg>
  );
}

function ChevronIcon({ collapsed }: { collapsed: boolean }) {
  return (
    <svg
      aria-hidden="true"
      className={`size-3 shrink-0 transition-transform ${collapsed ? "-rotate-90" : ""}`}
      fill="none"
      viewBox="0 0 16 16"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m4 6 4 4 4-4" />
    </svg>
  );
}

function isThreadWorking(thread: PluginSidebarThread) {
  return (
    thread.indicator === "runtime" ||
    thread.indicator === "workflow" ||
    thread.indicator === "background-agent" ||
    thread.indicator === "background-command" ||
    Object.values(thread.activity).some((count) => count > 0)
  );
}

function ThreadIndicator({
  thread,
  workingOnly = false,
}: {
  thread: PluginSidebarThread;
  workingOnly?: boolean;
}) {
  if (thread.indicator === "none") return null;

  const activelyWorking = isThreadWorking(thread);
  const needsAttention =
    thread.indicator === "unread-error" ||
    thread.indicator === "waiting-for-input";
  const succeeded = thread.indicator === "unread-success";

  if (activelyWorking) {
    return (
      <svg
        aria-label={thread.indicatorLabel ?? "Thread is working"}
        className="size-3.5 animate-spin text-primary"
        fill="none"
        role="img"
        viewBox="0 0 16 16"
      >
        <circle
          className="opacity-25"
          cx="8"
          cy="8"
          r="6"
          stroke="currentColor"
          strokeWidth="2"
        />
        <path
          className="opacity-90"
          d="M14 8a6 6 0 0 0-6-6"
          stroke="currentColor"
          strokeLinecap="round"
          strokeWidth="2"
        />
      </svg>
    );
  }

  if (workingOnly) return null;

  return (
    <span
      aria-label={thread.indicatorLabel ?? "Thread status"}
      className={`size-1.5 shrink-0 rounded-full ${
        needsAttention
          ? "bg-destructive"
          : succeeded
            ? "bg-emerald-500"
            : "bg-primary"
      }`}
      role="img"
    />
  );
}

interface ThreadRowProps {
  thread: PluginSidebarThread;
  projectName: string;
  active: boolean;
  nested?: boolean;
  childrenSummary?: {
    count: number;
    workingCount: number;
    expanded: boolean;
    hasActiveChild: boolean;
    onToggle: () => void;
  };
  onNavigate: () => void;
}

function ThreadRow({
  thread,
  projectName,
  active,
  nested = false,
  childrenSummary,
  onNavigate,
}: ThreadRowProps) {
  const actions = experimental_useSidebarThreadActions();
  const { splitProps } = experimental_useSidebarThreadSplit(thread.id);
  const [menuOpen, setMenuOpen] = useState(false);
  const [pinPending, setPinPending] = useState(false);
  const [renamePending, setRenamePending] = useState(false);
  const [renameTitle, setRenameTitle] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const title = thread.title ?? thread.titleFallback ?? "Untitled thread";
  const branchName = thread.environment?.branchName;
  const isChild = thread.parentThreadId !== null;
  const isRenaming = renameTitle !== null;
  const hasVisibleIndicator = isThreadWorking(thread) || (!isChild && thread.indicator !== "none");

  useEffect(() => {
    if (!menuOpen) return;
    const close = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [menuOpen]);

  useEffect(() => {
    if (!isRenaming) return;
    renameInputRef.current?.focus();
    renameInputRef.current?.select();
  }, [isRenaming]);

  const togglePin = async () => {
    if (pinPending) return;
    setPinPending(true);
    try {
      await actions.setPinned(thread.id, !thread.isPinned);
    } finally {
      setPinPending(false);
    }
  };

  const openThread = (split = false) => {
    actions.open(thread.id, split ? { split: true } : undefined);
    onNavigate();
  };

  const commitRename = async () => {
    if (renameTitle === null || renamePending) return;
    const nextTitle = renameTitle.trim();
    if (!nextTitle || nextTitle === title) {
      setRenameTitle(null);
      return;
    }

    setRenamePending(true);
    try {
      await actions.rename(thread.id, nextTitle);
      setRenameTitle(null);
    } finally {
      setRenamePending(false);
    }
  };

  return (
    <div
      className={`group/thread relative mr-2 rounded-lg transition-colors ${
        nested ? "ml-5" : "ml-2"
      } ${
        active ? "bg-accent text-accent-foreground" : "hover:bg-accent/60"
      }`}
    >
      <a
        {...splitProps}
        aria-current={active ? "page" : undefined}
        className={`block min-w-0 cursor-pointer px-2.5 outline-none transition-[padding] focus-visible:ring-2 focus-visible:ring-ring group-hover/thread:pr-[4.75rem] group-focus-within/thread:pr-[4.75rem] ${
          childrenSummary ? "pb-1 pt-2" : "py-2"
        } ${hasVisibleIndicator ? "pr-8" : "pr-2.5"}`}
        data-sidebar-thread-id={thread.id}
        data-sidebar-thread-shortcut-target=""
        href="#"
        onClick={(event) => {
          event.preventDefault();
          openThread(event.metaKey || event.ctrlKey);
        }}
      >
        <span className="flex min-w-0 items-center gap-1.5">
          {renameTitle !== null ? (
            <input
              aria-label="Thread title"
              className="h-6 min-w-0 flex-1 rounded border border-border bg-background px-1.5 text-sm font-medium outline-none focus:border-ring focus:ring-1 focus:ring-ring disabled:opacity-60"
              disabled={renamePending}
              onBlur={() => void commitRename()}
              onChange={(event) => setRenameTitle(event.target.value)}
              onClick={(event) => event.stopPropagation()}
              onKeyDown={(event) => {
                event.stopPropagation();
                if (event.key === "Enter") {
                  event.preventDefault();
                  event.currentTarget.blur();
                } else if (event.key === "Escape") {
                  event.preventDefault();
                  setRenameTitle(null);
                }
              }}
              onMouseDown={(event) => event.stopPropagation()}
              ref={renameInputRef}
              value={renameTitle}
            />
          ) : (
            <span
              className={`truncate text-sm ${thread.isUnread && !isChild ? "font-semibold" : "font-medium"}`}
              title={title}
            >
              {title}
            </span>
          )}
        </span>

        {thread.isPinned ? (
          <span
            className="mt-0.5 flex min-w-0 items-center gap-1 truncate text-[11px] leading-4 text-muted-foreground/70"
            title={branchName ? `${projectName} - ${branchName}` : projectName}
          >
            <span className="shrink-0">{projectName}</span>
            {branchName ? (
              <>
                <span aria-hidden="true">-</span>
                <BranchIcon />
                <span className="truncate">{branchName}</span>
              </>
            ) : null}
          </span>
        ) : null}
      </a>

      {childrenSummary ? (
        <button
          aria-expanded={childrenSummary.expanded}
          className="flex w-full min-w-0 items-center gap-1 rounded-b-lg px-2.5 pb-1.5 text-[11px] leading-4 text-muted-foreground/70 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          onClick={childrenSummary.onToggle}
          type="button"
        >
          <ChevronIcon collapsed={!childrenSummary.expanded} />
          <span>{childrenSummary.count} children</span>
          {childrenSummary.workingCount ? (
            <>
              <span aria-hidden="true">·</span>
              <svg
                aria-hidden="true"
                className="size-3 shrink-0 animate-spin text-primary"
                fill="none"
                viewBox="0 0 16 16"
              >
                <circle className="opacity-25" cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="2" />
                <path d="M14 8a6 6 0 0 0-6-6" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
              </svg>
              <span className="text-primary">{childrenSummary.workingCount} working</span>
            </>
          ) : null}
          {!childrenSummary.expanded && childrenSummary.hasActiveChild ? (
            <>
              <span aria-hidden="true">·</span>
              <span className="text-foreground/70">1 open</span>
            </>
          ) : null}
        </button>
      ) : null}

      <div className="pointer-events-none absolute right-3 top-3 transition-opacity group-hover/thread:opacity-0 group-focus-within/thread:opacity-0">
        <ThreadIndicator thread={thread} workingOnly={isChild} />
      </div>

      <div className="pointer-events-none absolute right-1.5 top-1.5 flex items-center gap-0.5 opacity-0 transition-opacity group-hover/thread:pointer-events-auto group-hover/thread:opacity-100 group-focus-within/thread:pointer-events-auto group-focus-within/thread:opacity-100">
        <button
          aria-label={thread.isPinned ? `Unpin ${title}` : `Pin ${title}`}
          className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-background hover:text-foreground disabled:opacity-50"
          disabled={pinPending}
          onClick={() => void togglePin()}
          title={thread.isPinned ? "Unpin thread" : "Pin thread"}
          type="button"
        >
          <PinIcon filled={thread.isPinned} />
        </button>

        <div ref={menuRef}>
          <button
            aria-expanded={menuOpen}
            aria-haspopup="menu"
            aria-label={`More actions for ${title}`}
            className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-background hover:text-foreground"
            onClick={() => setMenuOpen((open) => !open)}
            title="More actions"
            type="button"
          >
            <MoreIcon />
          </button>

          {menuOpen ? (
            <div
              className="absolute right-0 top-8 z-50 min-w-44 rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
              role="menu"
            >
              <MenuButton onClick={() => openThread(true)}>Open in split</MenuButton>
              <MenuButton
                onClick={() => {
                  setMenuOpen(false);
                  void copyThreadId(thread.id);
                }}
              >
                Copy thread ID
              </MenuButton>
              <MenuButton
                onClick={() => {
                  setMenuOpen(false);
                  void togglePin();
                }}
              >
                {thread.isPinned ? "Unpin" : "Pin"}
              </MenuButton>
              <MenuButton
                onClick={() => {
                  setMenuOpen(false);
                  void actions.setRead(thread.id, thread.isUnread);
                }}
              >
                Mark as {thread.isUnread ? "read" : "unread"}
              </MenuButton>
              <MenuButton
                onClick={() => {
                  setMenuOpen(false);
                  setRenameTitle(title);
                }}
              >
                Rename
              </MenuButton>
              <div className="my-1 h-px bg-border" />
              <MenuButton
                onClick={() => {
                  setMenuOpen(false);
                  actions.archive(thread.id);
                }}
              >
                Archive
              </MenuButton>
              <MenuButton
                destructive
                onClick={() => {
                  setMenuOpen(false);
                  actions.requestDelete(thread.id);
                }}
              >
                Delete…
              </MenuButton>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function ChildThreadRow({
  active,
  onNavigate,
  thread,
}: {
  active: boolean;
  onNavigate: () => void;
  thread: PluginSidebarThread;
}) {
  const actions = experimental_useSidebarThreadActions();
  const { splitProps } = experimental_useSidebarThreadSplit(thread.id);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const title = thread.title ?? thread.titleFallback ?? "Untitled thread";
  const working = isThreadWorking(thread);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [menuOpen]);

  const openThread = (split = false) => {
    actions.open(thread.id, split ? { split: true } : undefined);
    onNavigate();
  };

  return (
    <div
      className={`group/child relative min-w-0 rounded-md transition-colors ${
        active ? "bg-accent text-accent-foreground" : "hover:bg-accent/50"
      }`}
    >
      <a
        {...splitProps}
        aria-current={active ? "page" : undefined}
        className={`flex min-w-0 cursor-pointer items-center rounded-md py-[3px] pl-2 outline-none transition-[padding] focus-visible:ring-2 focus-visible:ring-ring group-hover/child:pr-7 group-focus-within/child:pr-7 ${
          working ? "pr-5" : "pr-1.5"
        }`}
        data-sidebar-thread-id={thread.id}
        data-sidebar-thread-shortcut-target=""
        href="#"
        onClick={(event) => {
          event.preventDefault();
          openThread(event.metaKey || event.ctrlKey);
        }}
      >
        <span
          className={`min-w-0 flex-1 truncate text-xs font-normal leading-5 ${
            active
              ? ""
              : working
                ? "text-foreground/85"
                : "text-muted-foreground/80 group-hover/child:text-foreground"
          }`}
          title={title}
        >
          {title}
        </span>
      </a>

      {working ? (
        <div className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 transition-opacity group-hover/child:opacity-0 group-focus-within/child:opacity-0">
          <ThreadIndicator thread={thread} workingOnly />
        </div>
      ) : null}

      <div
        className="pointer-events-none absolute right-0 top-0 opacity-0 transition-opacity group-hover/child:pointer-events-auto group-hover/child:opacity-100 group-focus-within/child:pointer-events-auto group-focus-within/child:opacity-100"
        ref={menuRef}
      >
        <button
          aria-expanded={menuOpen}
          aria-haspopup="menu"
          aria-label={`More actions for ${title}`}
          className="grid size-6 place-items-center rounded-md text-muted-foreground hover:bg-background hover:text-foreground"
          onClick={() => setMenuOpen((open) => !open)}
          title="More actions"
          type="button"
        >
          <MoreIcon />
        </button>

        {menuOpen ? (
          <div
            className="absolute right-0 top-6 z-50 min-w-44 rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
            role="menu"
          >
            <MenuButton
              onClick={() => {
                setMenuOpen(false);
                openThread(true);
              }}
            >
              Open in split
            </MenuButton>
            <MenuButton
              onClick={() => {
                setMenuOpen(false);
                void copyThreadId(thread.id);
              }}
            >
              Copy thread ID
            </MenuButton>
            <div className="my-1 h-px bg-border" />
            <MenuButton
              onClick={() => {
                setMenuOpen(false);
                actions.archive(thread.id);
              }}
            >
              Archive
            </MenuButton>
            <MenuButton
              destructive
              onClick={() => {
                setMenuOpen(false);
                actions.requestDelete(thread.id);
              }}
            >
              Delete…
            </MenuButton>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ChildThreadList({
  activeThreadId,
  children,
  expanded,
  limitThreads,
  onNavigate,
}: {
  activeThreadId: string | null;
  children: readonly PluginSidebarThread[];
  expanded: boolean;
  limitThreads: boolean;
  onNavigate: () => void;
}) {
  const [showAll, setShowAll] = useState(false);
  if (!expanded) return null;

  const visibleChildren = limitThreads && !showAll ? children.slice(0, 5) : children;
  const hiddenCount = children.length - visibleChildren.length;
  return (
    <div className="ml-7 mr-2 border-l border-border/70 pl-1">
      {visibleChildren.map((child) => (
        <ChildThreadRow
          active={child.id === activeThreadId}
          key={child.id}
          onNavigate={onNavigate}
          thread={child}
        />
      ))}
      {hiddenCount > 0 ? (
        <button
          className="w-full rounded-md py-[3px] pl-2 text-left text-[11px] leading-5 text-muted-foreground opacity-55 transition-opacity hover:bg-accent/50 hover:text-foreground hover:opacity-100 focus-visible:opacity-100"
          onClick={() => setShowAll(true)}
          type="button"
        >
          +{hiddenCount} more
        </button>
      ) : null}
    </div>
  );
}

function SortablePinnedRoot({
  children,
  disabled,
  id,
}: {
  children: React.ReactNode;
  disabled: boolean;
  id: string;
}) {
  const {
    isDragging,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id, disabled });

  return (
    <div
      {...listeners}
      className="relative space-y-px"
      ref={setNodeRef}
      style={{
        opacity: isDragging ? 0.55 : undefined,
        position: isDragging ? "relative" : undefined,
        transform: CSS.Translate.toString(transform),
        transition,
        zIndex: isDragging ? 20 : undefined,
      }}
    >
      {children}
    </div>
  );
}

function PinnedThreadsSection({
  activeThreadId,
  allThreads,
  expandAll,
  onNavigate,
  pinnedThreads,
  projectNames,
}: {
  activeThreadId: string | null;
  allThreads: readonly PluginSidebarThread[];
  expandAll: boolean;
  onNavigate: () => void;
  pinnedThreads: readonly PluginSidebarThread[];
  projectNames: ReadonlyMap<string, string>;
}) {
  const rpc = useRpc<typeof rpcContract>();
  const [expandedParents, setExpandedParents] = useState<Set<string>>(
    () => new Set(),
  );
  const [orderedRootIds, setOrderedRootIds] = useState<string[]>([]);
  const orderRequestId = useRef(0);
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 200, tolerance: 6 },
    }),
  );
  const pinnedIds = new Set(pinnedThreads.map((thread) => thread.id));
  const roots = pinnedThreads.filter(
    (thread) => !thread.parentThreadId || !pinnedIds.has(thread.parentThreadId),
  );
  const rootsById = new Map(roots.map((thread) => [thread.id, thread]));
  const rootMembershipKey = [...rootsById.keys()].sort().join("\u0000");
  const retainedIds = orderedRootIds.filter((id) => rootsById.has(id));
  const retainedIdSet = new Set(retainedIds);
  const newIds = roots
    .map((thread) => thread.id)
    .filter((id) => !retainedIdSet.has(id));
  const renderedRootIds = [...newIds, ...retainedIds];
  const orderedRoots = renderedRootIds.map((id) => rootsById.get(id)!);

  useEffect(() => {
    let current = true;
    const requestId = ++orderRequestId.current;
    setOrderedRootIds(renderedRootIds);
    void rpc.call("pinnedThreadOrder", {}).then(({ threadIds }) => {
      if (!current || requestId !== orderRequestId.current) return;
      const orderedIds = threadIds.filter((id) => rootsById.has(id));
      const orderedIdSet = new Set(orderedIds);
      const missingIds = roots
        .map((thread) => thread.id)
        .filter((id) => !orderedIdSet.has(id));
      setOrderedRootIds([...missingIds, ...orderedIds]);
    });
    return () => {
      current = false;
    };
  }, [rootMembershipKey, rpc]);

  const reorder = async (event: DragEndEvent) => {
    const activeId = String(event.active.id);
    const overId = event.over ? String(event.over.id) : null;
    if (!overId || activeId === overId) return;

    const oldIndex = orderedRoots.findIndex((thread) => thread.id === activeId);
    const newIndex = orderedRoots.findIndex((thread) => thread.id === overId);
    if (oldIndex === -1 || newIndex === -1) return;

    const nextRoots = arrayMove(orderedRoots, oldIndex, newIndex);
    const movedIndex = nextRoots.findIndex((thread) => thread.id === activeId);
    const nextIds = nextRoots.map((thread) => thread.id);
    setOrderedRootIds(nextIds);
    const requestId = ++orderRequestId.current;

    try {
      const result = await rpc.call("reorderPinnedThread", {
        threadId: activeId,
        previousThreadId: nextRoots[movedIndex - 1]?.id ?? null,
        nextThreadId: nextRoots[movedIndex + 1]?.id ?? null,
      });
      if (requestId === orderRequestId.current) {
        setOrderedRootIds(result.threadIds.filter((id) => rootsById.has(id)));
      }
    } catch {
      try {
        const result = await rpc.call("pinnedThreadOrder", {});
        if (requestId === orderRequestId.current) {
          setOrderedRootIds(result.threadIds.filter((id) => rootsById.has(id)));
        }
      } catch {
        // Keep the optimistic order until the next pinned membership refresh.
      }
    }
  };

  return (
    <section>
      <div className="mx-2 px-2.5 py-1 text-xs font-medium text-muted-foreground">
        Pinned
      </div>
      <DndContext
        collisionDetection={closestCenter}
        onDragEnd={(event) => void reorder(event)}
        sensors={sensors}
      >
        <SortableContext
          items={orderedRoots.map((thread) => thread.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="space-y-0.5">
          {orderedRoots.map((thread) => {
          const children = allThreads.filter(
            (candidate) => candidate.parentThreadId === thread.id,
          );
          const expanded = expandAll || expandedParents.has(thread.id);
          const workingCount = children.filter(isThreadWorking).length;
          return (
            <SortablePinnedRoot
              disabled={orderedRoots.length < 2}
              id={thread.id}
              key={thread.id}
            >
              <ThreadRow
                active={thread.id === activeThreadId}
                childrenSummary={children.length ? {
                  count: children.length,
                  workingCount,
                  expanded,
                  hasActiveChild: children.some((child) => child.id === activeThreadId),
                  onToggle: () => {
                    setExpandedParents((current) => {
                      const next = new Set(current);
                      if (next.has(thread.id)) next.delete(thread.id);
                      else next.add(thread.id);
                      return next;
                    });
                  },
                } : undefined}
                onNavigate={onNavigate}
                projectName={projectNames.get(thread.projectId) ?? "Unknown project"}
                thread={thread}
              />
              {children.length ? (
                <ChildThreadList
                  activeThreadId={activeThreadId}
                  children={children}
                  expanded={expanded}
                  limitThreads={!expandAll}
                  onNavigate={onNavigate}
                />
              ) : null}
            </SortablePinnedRoot>
          );
          })}
          </div>
        </SortableContext>
      </DndContext>
    </section>
  );
}

function MenuButton({
  children,
  destructive = false,
  onClick,
}: {
  children: React.ReactNode;
  destructive?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className={`flex w-full rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent ${
        destructive ? "text-destructive" : ""
      }`}
      onClick={onClick}
      role="menuitem"
      type="button"
    >
      {children}
    </button>
  );
}

interface ProjectThreadGroup {
  id: string;
  name: string;
  branchName: string | null;
  threads: readonly PluginSidebarThread[];
}

interface ProjectCreationHost {
  id: string;
  name: string;
}

function CreateProjectDialog({
  busy,
  error,
  hosts,
  onChoose,
  onOpenChange,
  open,
}: {
  busy: boolean;
  error: string | null;
  hosts: readonly ProjectCreationHost[];
  onChoose: (hostId: string) => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  const [hostId, setHostId] = useState("");

  useEffect(() => {
    if (!open) return;
    setHostId((selected) =>
      hosts.some((host) => host.id === selected)
        ? selected
        : (hosts[0]?.id ?? ""),
    );
  }, [hosts, open]);

  const handleChoose = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!hostId || busy) return;
    onChoose(hostId);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add project</DialogTitle>
          <DialogDescription>
            Choose the machine that contains the project, then select its folder.
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={handleChoose}>
          {hosts.length ? (
            <label className="block space-y-1.5 text-sm font-medium">
              <span>Machine</span>
              <select
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
                disabled={busy}
                onChange={(event) => setHostId(event.target.value)}
                value={hostId}
              >
                {hosts.map((host) => (
                  <option key={host.id} value={host.id}>{host.name}</option>
                ))}
              </select>
            </label>
          ) : null}
          {hosts.length === 0 && !error ? (
            <p className="text-sm text-muted-foreground">
              No machine is online. Start one to add a project.
            </p>
          ) : null}
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <DialogFooter>
            <Button
              disabled={busy}
              onClick={() => onOpenChange(false)}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
            <Button
              disabled={busy || !hostId}
              type="submit"
            >
              {busy ? "Opening…" : "Choose project folder"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ProjectsHeader({
  busy,
  onNewProject,
}: {
  busy: boolean;
  onNewProject: () => void;
}) {
  return (
    <div className="group/projects mx-2 flex min-w-0 items-center rounded-md px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent/50 focus-within:bg-accent/50">
      <span className="min-w-0 flex-1 truncate">Projects</span>
      <button
        aria-label="New project"
        className="grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground opacity-0 transition-opacity hover:bg-background hover:text-foreground focus:opacity-100 focus-visible:ring-2 focus-visible:ring-ring group-hover/projects:opacity-100 group-focus-within/projects:opacity-100"
        disabled={busy}
        onClick={onNewProject}
        title="New project"
        type="button"
      >
        <NewProjectIcon />
      </button>
    </div>
  );
}

function ProjectGroup({
  activeThreadId,
  collapsed,
  group,
  limitThreads,
  onNavigate,
  onToggle,
}: {
  activeThreadId: string | null;
  collapsed: boolean;
  group: ProjectThreadGroup;
  limitThreads: boolean;
  onNavigate: () => void;
  onToggle: () => void;
}) {
  const actions = experimental_useSidebarThreadActions();
  const rpc = useRpc<typeof rpcContract>();
  const [showAll, setShowAll] = useState(false);
  const [expandedParents, setExpandedParents] = useState<Set<string>>(
    () => new Set(),
  );
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const threadIds = new Set(group.threads.map((thread) => thread.id));
  const rootThreads = group.threads.filter(
    (thread) => !thread.parentThreadId || !threadIds.has(thread.parentThreadId),
  );
  const visibleThreads =
    limitThreads && !showAll ? rootThreads.slice(0, 5) : rootThreads;
  const hasMore = limitThreads && !showAll && rootThreads.length > 5;

  useEffect(() => {
    if (!menuOpen) return;
    const close = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [menuOpen]);

  const openProjectSettings = () => {
    window.location.assign(`/projects/${encodeURIComponent(group.id)}/settings`);
  };

  return (
    <section>
      <div className="group/project relative">
        <button
          aria-expanded={!collapsed}
          className="mx-2 flex w-[calc(100%-1rem)] items-center gap-1.5 rounded-md py-1.5 pl-2.5 pr-2.5 text-xs font-medium text-muted-foreground/70 transition-[padding] group-hover/project:bg-accent/50 group-hover/project:pr-[4.5rem] group-hover/project:text-muted-foreground group-focus-within/project:bg-accent/50 group-focus-within/project:pr-[4.5rem] group-focus-within/project:text-muted-foreground"
          onClick={onToggle}
          type="button"
        >
          <ChevronIcon collapsed={collapsed} />
          <span className="shrink-0">{group.name}</span>
          {group.branchName ? (
            <span className="flex min-w-0 items-center gap-1 opacity-75">
              <span aria-hidden="true">-</span>
              <BranchIcon />
              <span className="truncate">{group.branchName}</span>
            </span>
          ) : null}
        </button>

        <div className="pointer-events-none absolute right-2 top-0.5 flex items-center gap-0.5 opacity-0 transition-opacity group-hover/project:pointer-events-auto group-hover/project:opacity-100 group-focus-within/project:pointer-events-auto group-focus-within/project:opacity-100">
          <div ref={menuRef}>
            <button
              aria-expanded={menuOpen}
              aria-haspopup="menu"
              aria-label={`${group.name} actions`}
              className="grid size-7 place-items-center rounded-md text-muted-foreground hover:text-foreground"
              onClick={() => setMenuOpen((open) => !open)}
              title="Project actions"
              type="button"
            >
              <MoreIcon />
            </button>

            {menuOpen ? (
              <div
                className="absolute right-0 top-8 z-50 min-w-44 rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
                role="menu"
              >
                <MenuButton onClick={openProjectSettings}>Project settings</MenuButton>
                <MenuButton
                  onClick={() => {
                    setMenuOpen(false);
                    toast.promise(rpc.call("mainAndSync", { projectId: group.id }), {
                      loading: "Switching to main and pulling…",
                      success: "Main is up to date",
                      error: (error) =>
                        error instanceof Error ? error.message : "Couldn’t sync main",
                    });
                  }}
                >
                  Main &amp; Sync
                </MenuButton>
                <div className="my-1 h-px bg-border" />
                <MenuButton
                  onClick={() => {
                    setMenuOpen(false);
                    const name = window.prompt("Rename project", group.name)?.trim();
                    if (name && name !== group.name) {
                      void rpc.call("renameProject", { projectId: group.id, name });
                    }
                  }}
                >
                  Rename
                </MenuButton>
                <MenuButton onClick={openProjectSettings}>Add local path…</MenuButton>
                <MenuButton
                  destructive
                  onClick={() => {
                    setMenuOpen(false);
                    if (
                      window.confirm(
                        `Remove "${group.name}" and all of its threads? This cannot be undone.`,
                      )
                    ) {
                      void rpc.call("removeProject", { projectId: group.id });
                    }
                  }}
                >
                  Remove
                </MenuButton>
              </div>
            ) : null}
          </div>

          <button
            aria-label={`New thread in ${group.name}`}
            className="grid size-7 place-items-center rounded-md text-muted-foreground hover:text-foreground"
            onClick={() => {
              actions.openNewThread({ projectId: group.id, focusPrompt: true });
              onNavigate();
            }}
            title="New thread"
            type="button"
          >
            <NewThreadIcon />
          </button>
        </div>
      </div>
      {!collapsed ? (
        <div className="space-y-0.5">
          {visibleThreads.length === 0 ? (
            <div className="ml-5 mr-2 px-2.5 py-1.5 text-xs text-muted-foreground/60">
              No threads
            </div>
          ) : null}
          {visibleThreads.map((thread) => {
            const children = group.threads.filter(
              (candidate) => candidate.parentThreadId === thread.id,
            );
            const expanded = !limitThreads || expandedParents.has(thread.id);
            const workingCount = children.filter(isThreadWorking).length;
            return (
              <div className="space-y-px" key={thread.id}>
                <ThreadRow
                  active={thread.id === activeThreadId}
                  childrenSummary={children.length ? {
                    count: children.length,
                    workingCount,
                    expanded,
                    hasActiveChild: children.some((child) => child.id === activeThreadId),
                    onToggle: () => {
                      setExpandedParents((current) => {
                        const next = new Set(current);
                        if (next.has(thread.id)) next.delete(thread.id);
                        else next.add(thread.id);
                        return next;
                      });
                    },
                  } : undefined}
                  nested
                  onNavigate={onNavigate}
                  projectName={group.name}
                  thread={thread}
                />
                {children.length ? (
                  <ChildThreadList
                    activeThreadId={activeThreadId}
                    children={children}
                    expanded={expanded}
                    limitThreads={limitThreads}
                    onNavigate={onNavigate}
                  />
                ) : null}
              </div>
            );
          })}
          {hasMore ? (
            <button
              className="ml-5 mr-2 w-[calc(100%-1.75rem)] rounded-md px-2.5 py-1.5 text-left text-xs font-medium text-muted-foreground opacity-55 transition-opacity hover:bg-accent/50 hover:text-foreground hover:opacity-100 focus-visible:opacity-100"
              onClick={() => setShowAll(true)}
              type="button"
            >
              Show more
            </button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function SidebarThreadList({
  activeThreadId,
  onNavigate,
  searchQuery,
}: PluginThreadListProps) {
  const { status, threads, projects } = experimental_useSidebarThreads();
  const actions = experimental_useSidebarThreadActions();
  const rpc = useRpc<typeof rpcContract>();
  const [createProjectOpen, setCreateProjectOpen] = useState(false);
  const [createProjectBusy, setCreateProjectBusy] = useState(false);
  const [createProjectError, setCreateProjectError] = useState<string | null>(null);
  const [projectCreationHosts, setProjectCreationHosts] = useState<ProjectCreationHost[]>([]);
  const [projectBranches, setProjectBranches] = useState<Record<string, string | null>>(
    {},
  );
  const [collapsedProjects, setCollapsedProjects] = useState<Set<string>>(
    () => new Set(),
  );
  const projectNames = useMemo(
    () => new Map(projects.map((project) => [project.id, project.name])),
    [projects],
  );
  const query = searchQuery.trim().toLocaleLowerCase();
  const branchProjectIds = useMemo(
    () => projects.map((project) => project.id),
    [projects],
  );
  const projectIdsKey = branchProjectIds.join("\u0000");

  useEffect(() => {
    let current = true;
    let inFlight = false;
    const projectIds = projectIdsKey ? projectIdsKey.split("\u0000") : [];
    if (!projectIds.length) {
      setProjectBranches({});
      return () => {
        current = false;
      };
    }

    const refresh = async () => {
      if (inFlight || document.hidden) return;
      inFlight = true;
      try {
        const branches = await rpc.call("projectBranches", { projectIds });
        if (current) setProjectBranches(branches);
      } catch {
        // Keep the last known labels during a transient host/Git failure.
      } finally {
        inFlight = false;
      }
    };
    const refreshWhenVisible = () => {
      if (!document.hidden) void refresh();
    };

    void refresh();
    const interval = window.setInterval(refreshWhenVisible, 15_000);
    window.addEventListener("focus", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      current = false;
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [projectIdsKey, rpc]);
  const visibleThreads = useMemo(() => {
    if (!query) return threads;
    const matchedIds = new Set(threads.filter((thread) => {
      const project = projectNames.get(thread.projectId) ?? "";
      const title = thread.title ?? thread.titleFallback ?? "";
      const branch = thread.environment?.branchName ?? "";
      return `${title} ${project} ${branch}`.toLocaleLowerCase().includes(query);
    }).map((thread) => thread.id));
    const byId = new Map(threads.map((thread) => [thread.id, thread]));
    for (const thread of threads) {
      if (!matchedIds.has(thread.id) || !thread.parentThreadId) continue;
      if (byId.has(thread.parentThreadId)) matchedIds.add(thread.parentThreadId);
    }
    return threads.filter((thread) => matchedIds.has(thread.id));
  }, [projectNames, query, threads]);
  const pinnedThreads = useMemo(
    () => visibleThreads.filter((thread) => thread.isPinned),
    [visibleThreads],
  );
  const projectGroups = useMemo(() => {
    const pinnedIds = new Set(pinnedThreads.map((thread) => thread.id));
    const unpinned = visibleThreads.filter(
      (thread) =>
        !thread.isPinned &&
        (!thread.parentThreadId || !pinnedIds.has(thread.parentThreadId)),
    );
    const knownProjectIds = new Set(projects.map((project) => project.id));
    const groups: ProjectThreadGroup[] = projects.flatMap((project) => {
      const projectThreads = unpinned.filter(
        (thread) => thread.projectId === project.id,
      );
      if (query && projectThreads.length === 0) return [];
      return [{
        id: project.id,
        name: project.name,
        branchName: projectBranches[project.id] ?? null,
        threads: projectThreads,
      }];
    });
    const unknownThreads = unpinned.filter(
      (thread) => !knownProjectIds.has(thread.projectId),
    );
    if (unknownThreads.length) {
      groups.push({
        id: "unknown",
        name: "Unknown project",
        branchName: null,
        threads: unknownThreads,
      });
    }
    return groups;
  }, [pinnedThreads, projectBranches, projects, query, visibleThreads]);

  const openCreatedProject = (projectId: string) => {
    actions.openNewThread({ projectId, focusPrompt: true });
    onNavigate();
  };

  const chooseProjectFolder = async (hostId: string) => {
    if (createProjectBusy) return;
    setCreateProjectOpen(false);
    setCreateProjectBusy(true);
    setCreateProjectError(null);
    try {
      const { project } = await rpc.call("pickProjectFolder", { hostId });
      if (project) openCreatedProject(project.id);
    } catch (cause) {
      setCreateProjectError(
        cause instanceof Error ? cause.message : "Couldn’t add project.",
      );
      setCreateProjectOpen(true);
    } finally {
      setCreateProjectBusy(false);
    }
  };

  const startProjectCreation = async () => {
    if (createProjectBusy) return;
    setCreateProjectBusy(true);
    setCreateProjectError(null);
    try {
      const { hosts } = await rpc.call("projectCreationOptions", {});
      setProjectCreationHosts(hosts);
      if (hosts.length === 1) {
        const { project } = await rpc.call("pickProjectFolder", {
          hostId: hosts[0].id,
        });
        if (project) openCreatedProject(project.id);
      } else {
        setCreateProjectOpen(true);
      }
    } catch (cause) {
      setCreateProjectError(
        cause instanceof Error ? cause.message : "Couldn’t add project.",
      );
      setCreateProjectOpen(true);
    } finally {
      setCreateProjectBusy(false);
    }
  };

  if (status === "loading") {
    return <div className="px-4 py-6 text-sm text-muted-foreground">Loading threads…</div>;
  }
  if (status === "error") {
    return <div className="px-4 py-6 text-sm text-destructive">Couldn’t load threads.</div>;
  }
  return (
    <>
      <div className="space-y-2 py-1">
        {pinnedThreads.length ? (
          <PinnedThreadsSection
            activeThreadId={activeThreadId}
            allThreads={visibleThreads}
            expandAll={Boolean(query)}
            onNavigate={onNavigate}
            pinnedThreads={pinnedThreads}
            projectNames={projectNames}
          />
        ) : null}

        <section>
          <ProjectsHeader
            busy={createProjectBusy}
            onNewProject={() => void startProjectCreation()}
          />
          <div className="mt-1 space-y-2">
            {projectGroups.map((group) => (
              <ProjectGroup
                activeThreadId={activeThreadId}
                collapsed={!query && collapsedProjects.has(group.id)}
                group={group}
                key={group.id}
                limitThreads={!query}
                onNavigate={onNavigate}
                onToggle={() => {
                  setCollapsedProjects((current) => {
                    const next = new Set(current);
                    if (next.has(group.id)) next.delete(group.id);
                    else next.add(group.id);
                    return next;
                  });
                }}
              />
            ))}
          </div>
        </section>

        {visibleThreads.length === 0 ? (
          <div className="px-4 py-3 text-sm text-muted-foreground">
            {query ? "No matching threads." : "No threads yet."}
          </div>
        ) : null}
      </div>
      <CreateProjectDialog
        busy={createProjectBusy}
        error={createProjectError}
        hosts={projectCreationHosts}
        onChoose={(hostId) => void chooseProjectFolder(hostId)}
        onOpenChange={setCreateProjectOpen}
        open={createProjectOpen}
      />
    </>
  );
}

export default definePluginApp((app) => {
  app.slots.experimental_threadList({
    id: "thread-details",
    title: "Thread details",
    description: "Project and branch context with quick pin controls.",
    component: SidebarThreadList,
  });
});
