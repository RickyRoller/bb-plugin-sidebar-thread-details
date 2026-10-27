import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
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
  experimental_ThreadActionsMenu as ThreadActionsMenu,
  useBbNavigate,
  experimental_useSidebarThreadSplit,
  experimental_useSidebarThreads,
  type PluginSidebarThread,
  type PluginThreadListProps,
  UrlLink,
  experimental_Icon as Icon,
  useRealtime,
  useRpc,
  useSdk,
} from "@get-bb/plugin-sdk/app";
import { z } from "zod";
import type { rpcContract } from "./server";
import {
  appearanceSchema,
  defaultAppearance,
  type Appearance,
} from "./appearance";
import {
  SECTION_METHOD,
  SECTION_REORDER_METHOD,
  mergeSections,
  sectionsOutputSchema,
  sortSections,
  type Badge,
  type Section,
  type SectionLink,
} from "./sections";
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

const AppearanceContext = createContext(defaultAppearance);
// Badges a section provider put on each thread it claims, by thread id.
const SectionThreadContext = createContext(
  new Map<string, { badges: readonly Badge[] }>(),
);

/**
 * Every section other plugins offer (see sections.ts), kept per provider. A
 * provider's refresh refetches only its own sections; bursts of refreshes
 * collapse into one request. A refresh from an unknown provider, or with no
 * provider named, finds providers again, so a plugin installed, reloaded or
 * removed later is picked up. A provider whose request fails keeps the
 * sections it last returned.
 */
function useSidebarSections(threadIds: string[]) {
  const sdk = useSdk();
  const [byPlugin, setByPlugin] = useState(new Map<string, Section[]>());
  const known = useRef(new Set<string>());
  const idsKey = [...threadIds].sort().join("\u0000");
  const generations = useRef(new Map<string, number>());
  const load = useCallback(
    (pluginId: string) => {
      const generation = (generations.current.get(pluginId) ?? 0) + 1;
      generations.current.set(pluginId, generation);
      const ids = idsKey ? idsKey.split("\u0000") : [];
      // One lookup per thousand rows, never a request per thread.
      void Promise.all(
        Array.from({ length: Math.max(1, Math.ceil(ids.length / 1000)) }, (_, i) =>
          sdk.plugins.callRpc({
            pluginId,
            method: SECTION_METHOD,
            input: { threadIds: ids.slice(i * 1000, (i + 1) * 1000) },
            outputSchema: sectionsOutputSchema,
          }),
        ),
      ).then(
        (pages) => {
          if (generations.current.get(pluginId) !== generation) return;
          if (!known.current.has(pluginId)) return;
          setByPlugin((current) =>
            new Map(current).set(pluginId, mergeSections(pluginId, pages)),
          );
        },
        () => {},
      );
    },
    [sdk, idsKey],
  );
  const discovery = useRef(0);
  const loadAll = useCallback(() => {
    const generation = ++discovery.current;
    void sdk.plugins
      .experimental_discoverRpc({ method: SECTION_METHOD })
      .then((methods) => [...new Set(methods.map((each) => each.pluginId))])
      .catch(() => [...known.current])
      .then((pluginIds) => {
        if (generation !== discovery.current) return;
        known.current = new Set(pluginIds);
        setByPlugin(
          (current) =>
            new Map([...current].filter(([id]) => known.current.has(id))),
        );
        pluginIds.forEach(load);
      });
  }, [sdk, load]);
  useEffect(loadAll, [loadAll]);

  const timers = useRef(new Map<string, number>());
  useEffect(
    () => () => {
      for (const timer of timers.current.values()) window.clearTimeout(timer);
    },
    [],
  );
  useRealtime("sections-refresh", (payload) => {
    const named = (payload as { pluginId?: unknown } | null)?.pluginId;
    const key =
      typeof named === "string" && known.current.has(named) ? named : "";
    if (timers.current.has(key)) return;
    timers.current.set(
      key,
      window.setTimeout(() => {
        timers.current.delete(key);
        if (key) load(key);
        else loadAll();
      }, 150),
    );
  });
  return useMemo(() => sortSections([...byPlugin.values()].flat()), [byPlugin]);
}

function useAppearance() {
  const rpc = useRpc<typeof rpcContract>();
  const [appearance, setAppearance] = useState(defaultAppearance);
  const receiveAppearance = useCallback((payload: unknown) => {
    const parsed = appearanceSchema.safeParse(payload);
    if (parsed.success) setAppearance(parsed.data);
  }, []);

  useRealtime("appearance", receiveAppearance);
  useEffect(() => {
    let current = true;
    void rpc.call("getAppearance", {}).then(
      (value) => {
        if (current) setAppearance(value);
      },
      () => {
        // Keep theme defaults if the backend is temporarily unavailable.
      },
    );
    return () => {
      current = false;
    };
  }, [rpc]);

  return appearance;
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
    <svg
      aria-hidden="true"
      className="size-4"
      viewBox="0 0 16 16"
      fill="currentColor"
    >
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

const COLLAPSED_PROJECTS_KEY = "sidebar-thread-details:collapsed-projects";

function loadCollapsedProjects(): Set<string> {
  try {
    const stored = JSON.parse(
      localStorage.getItem(COLLAPSED_PROJECTS_KEY) ?? "[]",
    );
    return new Set(Array.isArray(stored) ? stored : []);
  } catch {
    return new Set();
  }
}

function saveCollapsedProjects(ids: Set<string>) {
  try {
    localStorage.setItem(COLLAPSED_PROJECTS_KEY, JSON.stringify([...ids]));
  } catch {
    // Storage can be unavailable (private mode, quota); collapse still works for the session.
  }
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

const BADGE_TONES: Record<Badge["tone"], string> = {
  neutral: "border-border text-muted-foreground",
  info: "border-sky-500/40 text-sky-600 dark:text-sky-400",
  success: "border-emerald-500/40 text-emerald-600 dark:text-emerald-400",
  warning: "border-amber-500/50 text-amber-600 dark:text-amber-400",
  danger: "border-red-500/50 text-red-600 dark:text-red-400",
};

/** A section provider's badges; a badge with a link opens it, not the row. */
function BadgeList({
  badges,
  className,
}: {
  badges: readonly Badge[];
  className: string;
}) {
  return (
    <span
      className={className}
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
    >
      {badges.map((badge, index) => {
        const style = `inline-flex h-4 max-w-full items-center truncate rounded border px-1 text-[10px] leading-none ${BADGE_TONES[badge.tone]}`;
        return badge.href ? (
          <UrlLink
            className={style}
            href={badge.href}
            key={index}
            title={badge.title ?? undefined}
          >
            {badge.label}
          </UrlLink>
        ) : (
          <span className={style} key={index} title={badge.title ?? undefined}>
            {badge.label}
          </span>
        );
      })}
    </span>
  );
}

function ThreadRow({
  thread,
  projectName,
  active,
  nested = false,
  childrenSummary,
  onNavigate,
}: ThreadRowProps) {
  const appearance = useContext(AppearanceContext);
  const claimed = useContext(SectionThreadContext).get(thread.id);
  const titleBadges = claimed?.badges.filter((b) => b.placement === "title");
  const metaBadges = claimed?.badges.filter((b) => b.placement === "meta");
  const sdk = useSdk();
  const navigate = useBbNavigate();
  const { splitProps } = experimental_useSidebarThreadSplit(thread.id);
  const [pinPending, setPinPending] = useState(false);
  const [renamePending, setRenamePending] = useState(false);
  const [renameTitle, setRenameTitle] = useState<string | null>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const title = thread.title ?? thread.titleFallback ?? "Untitled thread";
  const branchName = thread.environment?.branchName;
  const isChild = thread.parentThreadId !== null;
  const isRenaming = renameTitle !== null;
  const hasVisibleIndicator =
    isThreadWorking(thread) || (!isChild && thread.indicator !== "none");

  useEffect(() => {
    if (!isRenaming) return;
    renameInputRef.current?.focus();
    renameInputRef.current?.select();
  }, [isRenaming]);

  const togglePin = async () => {
    if (pinPending) return;
    setPinPending(true);
    try {
      await sdk.threads[thread.isPinned ? "unpin" : "pin"]({
        threadId: thread.id,
      });
    } finally {
      setPinPending(false);
    }
  };

  const openThread = (split = false) => {
    navigate.toThread(thread.id, split ? { split: true } : undefined);
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
      await sdk.threads.update({ threadId: thread.id, title: nextTitle });
      setRenameTitle(null);
    } finally {
      setRenamePending(false);
    }
  };

  return (
    <div
      className={`group/thread relative mr-2 rounded-lg transition-colors ${
        nested ? "" : "ml-2"
      } ${active ? "bg-accent text-accent-foreground" : "hover:bg-accent/60"}`}
      style={nested ? { marginLeft: appearance.threadIndent } : undefined}
    >
      <div
        role="link"
        tabIndex={0}
        {...splitProps}
        aria-current={active ? "page" : undefined}
        className={`block min-w-0 cursor-pointer px-2.5 outline-none transition-[padding] focus-visible:ring-2 focus-visible:ring-ring group-hover/thread:pr-[4.75rem] group-focus-within/thread:pr-[4.75rem] ${
          childrenSummary ? "pb-1 pt-2" : "py-2"
        } ${hasVisibleIndicator ? "pr-8" : "pr-2.5"}`}
        data-sidebar-thread-id={thread.id}
        data-sidebar-thread-shortcut-target=""
        onKeyDown={(event) => {
          if (
            event.target === event.currentTarget &&
            (event.key === "Enter" || event.key === " ")
          ) {
            event.preventDefault();
            openThread(event.metaKey || event.ctrlKey);
          }
        }}
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
              style={{ color: appearance.threadColor || undefined }}
              title={title}
            >
              {title}
            </span>
          )}
          {titleBadges?.length ? (
            <BadgeList
              badges={titleBadges}
              className="flex shrink-0 items-center gap-1"
            />
          ) : null}
        </span>

        {thread.isPinned || claimed ? (
          <span
            className="mt-0.5 flex min-w-0 items-center gap-1 truncate text-[11px] leading-4 text-muted-foreground/70"
            title={branchName ? `${projectName} - ${branchName}` : projectName}
          >
            <span
              className="shrink-0"
              style={{ color: appearance.projectColor || undefined }}
            >
              {projectName}
            </span>
            {claimed ? (
              <span className="truncate">
                ·{" "}
                {thread.environment?.isWorktree
                  ? "BB worktree"
                  : (thread.environment?.name ?? "Workspace")}
              </span>
            ) : branchName ? (
              <span
                className="flex min-w-0 items-center gap-1"
                style={{ color: appearance.branchColor || undefined }}
              >
                <span aria-hidden="true">-</span>
                <BranchIcon />
                <span className="truncate">{branchName}</span>
              </span>
            ) : null}
          </span>
        ) : null}
        {metaBadges?.length ? (
          <BadgeList
            badges={metaBadges}
            className="mt-1 flex min-w-0 flex-wrap items-center gap-1"
          />
        ) : null}
      </div>

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
                <circle
                  className="opacity-25"
                  cx="8"
                  cy="8"
                  r="6"
                  stroke="currentColor"
                  strokeWidth="2"
                />
                <path
                  d="M14 8a6 6 0 0 0-6-6"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeWidth="2"
                />
              </svg>
              <span className="text-primary">
                {childrenSummary.workingCount} working
              </span>
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

        <ThreadActionsMenu
          thread={{
            ...thread,
            environment: thread.environment?.id
              ? { id: thread.environment.id, path: thread.environment.path }
              : null,
          }}
          requestRename={() => setRenameTitle(title)}
          trigger={(props) => (
            <button
              {...props}
              aria-label={`More actions for ${title}`}
              className={`${props.className ?? ""} grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-background hover:text-foreground`}
              title="More actions"
            >
              <MoreIcon />
            </button>
          )}
        />
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
  const appearance = useContext(AppearanceContext);
  const navigate = useBbNavigate();
  const { splitProps } = experimental_useSidebarThreadSplit(thread.id);
  const title = thread.title ?? thread.titleFallback ?? "Untitled thread";
  const working = isThreadWorking(thread);

  const openThread = (split = false) => {
    navigate.toThread(thread.id, split ? { split: true } : undefined);
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
          style={{ color: appearance.childThreadColor || undefined }}
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

      <div className="pointer-events-none absolute right-0 top-0 opacity-0 transition-opacity group-hover/child:pointer-events-auto group-hover/child:opacity-100 group-focus-within/child:pointer-events-auto group-focus-within/child:opacity-100">
        <ThreadActionsMenu
          thread={{
            ...thread,
            environment: thread.environment?.id
              ? { id: thread.environment.id, path: thread.environment.path }
              : null,
          }}
          trigger={(props) => (
            <button
              {...props}
              aria-label={`More actions for ${title}`}
              className={`${props.className ?? ""} grid size-6 place-items-center rounded-md text-muted-foreground hover:bg-background hover:text-foreground`}
              title="More actions"
            >
              <MoreIcon />
            </button>
          )}
        />
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

  const visibleChildren =
    limitThreads && !showAll ? children.slice(0, 5) : children;
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

function SortableListItem({
  children,
  disabled,
  id,
}: {
  children: React.ReactNode;
  disabled: boolean;
  id: string;
}) {
  const { isDragging, listeners, setNodeRef, transform, transition } =
    useSortable({ id, disabled });

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

/** The app's current path, kept current across in-app navigation. */
function usePathname(): string {
  const [pathname, setPathname] = useState(window.location.pathname);
  useEffect(() => {
    const navigation = (window as { navigation?: EventTarget }).navigation;
    const update = () =>
      setTimeout(() => setPathname(window.location.pathname), 0);
    navigation?.addEventListener("navigate", update);
    window.addEventListener("popstate", update);
    return () => {
      navigation?.removeEventListener("navigate", update);
      window.removeEventListener("popstate", update);
    };
  }, []);
  return pathname;
}

function SectionLinkRow({
  link,
  nested = false,
  onNavigate,
  pathname,
}: {
  link: Omit<SectionLink, "children">;
  nested?: boolean;
  onNavigate: () => void;
  pathname: string;
}) {
  const active = pathname === link.path;
  return (
    <UrlLink
      href={new URL(link.path, window.location.origin).href}
      aria-current={active ? "page" : undefined}
      onClick={onNavigate}
      className={`mx-2 flex min-w-0 items-center gap-2 rounded-lg text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring ${
        nested ? "mt-0.5 py-1.5 pl-7 pr-2.5" : "px-2.5 py-2"
      } ${
        active
          ? "bg-accent text-accent-foreground"
          : nested
            ? "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
            : "hover:bg-accent/60"
      }`}
    >
      {link.icon ? (
        <Icon
          name={link.icon as never}
          className={`size-3.5 shrink-0 ${nested ? "" : "text-muted-foreground"}`}
        />
      ) : null}
      <span
        className={`min-w-0 flex-1 truncate ${nested ? "" : "font-medium"}`}
      >
        {link.label}
      </span>
      {link.badges.length ? (
        <BadgeList
          badges={link.badges}
          className="flex shrink-0 items-center gap-1"
        />
      ) : null}
    </UrlLink>
  );
}

/**
 * One section another plugin offers: its links (draggable when the provider
 * accepts a new order), then the threads it claims with their children.
 */
function PluginSection({
  section,
  activeThreadId,
  onNavigate,
  roots,
  childrenByRoot,
  projectNames,
  expandAll,
}: {
  section: Section;
  activeThreadId: string | null;
  onNavigate: () => void;
  roots: readonly PluginSidebarThread[];
  childrenByRoot: ReadonlyMap<string, PluginSidebarThread[]>;
  projectNames: ReadonlyMap<string, string>;
  expandAll: boolean;
}) {
  const sdk = useSdk();
  const pathname = usePathname();
  const [expandedParents, setExpandedParents] = useState<Set<string>>(
    () => new Set(),
  );
  // Shown order: the provider's order until a drag reorders it.
  const [order, setOrder] = useState<string[] | null>(null);
  useEffect(() => setOrder(null), [section.links]);
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 200, tolerance: 6 },
    }),
  );
  const byId = new Map(section.links.map((link) => [link.id, link]));
  const links =
    order === null
      ? section.links
      : order.flatMap((id) => {
          const link = byId.get(id);
          return link === undefined ? [] : [link];
        });
  if (!links.length && !roots.length) return null;

  const reorder = async ({ active, over }: DragEndEvent) => {
    if (over === null || active.id === over.id) return;
    const ids = links.map((link) => link.id);
    const next = arrayMove(
      ids,
      ids.indexOf(String(active.id)),
      ids.indexOf(String(over.id)),
    );
    setOrder(next);
    try {
      await sdk.plugins.callRpc({
        pluginId: section.pluginId,
        method: SECTION_REORDER_METHOD,
        input: { sectionId: section.id, ids: next },
        outputSchema: z.object({ ids: z.array(z.string()) }),
      });
    } catch {
      setOrder(null);
      toast.error(`Couldn’t reorder ${section.title.toLocaleLowerCase()}`);
    }
  };

  return (
    <section aria-label={section.title}>
      <div className="mx-2 px-2.5 py-1 text-xs font-medium text-muted-foreground">
        {section.title}
      </div>
      {links.length ? (
        <DndContext
          collisionDetection={closestCenter}
          onDragEnd={(event) => void reorder(event)}
          sensors={sensors}
        >
          <SortableContext
            items={links.map((link) => link.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-0.5">
              {links.map((link) => (
                <SortableListItem
                  disabled={!section.reorderable || links.length < 2}
                  id={link.id}
                  key={link.id}
                >
                  <SectionLinkRow
                    link={link}
                    onNavigate={onNavigate}
                    pathname={pathname}
                  />
                  {link.children.map((child) => (
                    <SectionLinkRow
                      key={child.id}
                      link={child}
                      nested
                      onNavigate={onNavigate}
                      pathname={pathname}
                    />
                  ))}
                </SortableListItem>
              ))}
            </div>
          </SortableContext>
        </DndContext>
      ) : null}
      {roots.length ? (
        <div className={`space-y-0.5 ${links.length ? "mt-0.5" : ""}`}>
          {roots.map((thread) => {
            const children = childrenByRoot.get(thread.id) ?? [];
            const expanded = expandAll || expandedParents.has(thread.id);
            return (
              <div className="space-y-px" key={thread.id}>
                <ThreadRow
                  active={thread.id === activeThreadId}
                  thread={thread}
                  projectName={
                    projectNames.get(thread.projectId) ?? "Unknown project"
                  }
                  onNavigate={onNavigate}
                  childrenSummary={
                    children.length
                      ? {
                          count: children.length,
                          workingCount: children.filter(isThreadWorking)
                            .length,
                          expanded,
                          hasActiveChild: children.some(
                            (child) => child.id === activeThreadId,
                          ),
                          onToggle: () =>
                            setExpandedParents((current) => {
                              const next = new Set(current);
                              if (next.has(thread.id)) next.delete(thread.id);
                              else next.add(thread.id);
                              return next;
                            }),
                        }
                      : undefined
                  }
                />
                <ChildThreadList
                  activeThreadId={activeThreadId}
                  children={children}
                  expanded={expanded}
                  limitThreads={!expandAll}
                  onNavigate={onNavigate}
                />
              </div>
            );
          })}
        </div>
      ) : null}
    </section>
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
                <SortableListItem
                  disabled={orderedRoots.length < 2}
                  id={thread.id}
                  key={thread.id}
                >
                  <ThreadRow
                    active={thread.id === activeThreadId}
                    childrenSummary={
                      children.length
                        ? {
                            count: children.length,
                            workingCount,
                            expanded,
                            hasActiveChild: children.some(
                              (child) => child.id === activeThreadId,
                            ),
                            onToggle: () => {
                              setExpandedParents((current) => {
                                const next = new Set(current);
                                if (next.has(thread.id)) next.delete(thread.id);
                                else next.add(thread.id);
                                return next;
                              });
                            },
                          }
                        : undefined
                    }
                    onNavigate={onNavigate}
                    projectName={
                      projectNames.get(thread.projectId) ?? "Unknown project"
                    }
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
                </SortableListItem>
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
            Choose the machine that contains the project, then select its
            folder.
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
                  <option key={host.id} value={host.id}>
                    {host.name}
                  </option>
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
            <Button disabled={busy || !hostId} type="submit">
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
  const appearance = useContext(AppearanceContext);
  const navigate = useBbNavigate();
  const rpc = useRpc<typeof rpcContract>();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menuOpen) return;
    const close = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [menuOpen]);
  const [showAll, setShowAll] = useState(false);
  const [expandedParents, setExpandedParents] = useState<Set<string>>(
    () => new Set(),
  );
  const threadIds = new Set(group.threads.map((thread) => thread.id));
  const rootThreads = group.threads.filter(
    (thread) => !thread.parentThreadId || !threadIds.has(thread.parentThreadId),
  );
  const visibleThreads =
    limitThreads && !showAll ? rootThreads.slice(0, 5) : rootThreads;
  const hasMore = limitThreads && !showAll && rootThreads.length > 5;

  const openProjectSettings = () => {
    window.location.assign(
      `/projects/${encodeURIComponent(group.id)}/settings`,
    );
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
          <span
            className="shrink-0"
            style={{ color: appearance.projectColor || undefined }}
          >
            {group.name}
          </span>
          {group.branchName ? (
            <span
              className="flex min-w-0 items-center gap-1 opacity-75"
              style={{ color: appearance.branchColor || undefined }}
            >
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
                <MenuButton onClick={openProjectSettings}>
                  Project settings
                </MenuButton>
                <MenuButton
                  onClick={() => {
                    setMenuOpen(false);
                    toast.promise(
                      rpc.call("mainAndSync", { projectId: group.id }),
                      {
                        loading: "Switching to main and pulling…",
                        success: "Main is up to date",
                        error: (error) =>
                          error instanceof Error
                            ? error.message
                            : "Couldn’t sync main",
                      },
                    );
                  }}
                >
                  Main &amp; Sync
                </MenuButton>
                <div className="my-1 h-px bg-border" />
                <MenuButton
                  onClick={() => {
                    setMenuOpen(false);
                    const name = window
                      .prompt("Rename project", group.name)
                      ?.trim();
                    if (name && name !== group.name) {
                      void rpc.call("renameProject", {
                        projectId: group.id,
                        name,
                      });
                    }
                  }}
                >
                  Rename
                </MenuButton>
                <MenuButton onClick={openProjectSettings}>
                  Add local path…
                </MenuButton>
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
              navigate.toCompose({ projectId: group.id, focusPrompt: true });
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
                  childrenSummary={
                    children.length
                      ? {
                          count: children.length,
                          workingCount,
                          expanded,
                          hasActiveChild: children.some(
                            (child) => child.id === activeThreadId,
                          ),
                          onToggle: () => {
                            setExpandedParents((current) => {
                              const next = new Set(current);
                              if (next.has(thread.id)) next.delete(thread.id);
                              else next.add(thread.id);
                              return next;
                            });
                          },
                        }
                      : undefined
                  }
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
  const appearance = useAppearance();
  const { status, threads, projects } = experimental_useSidebarThreads();
  const sections = useSidebarSections(threads.map((thread) => thread.id));
  // Each claimed thread's badges, and the section that claimed it first.
  const claims = useMemo(() => {
    const badges = new Map<string, { badges: readonly Badge[] }>();
    const sectionOf = new Map<string, string>();
    const activityAt = new Map<string, number>();
    for (const section of sections)
      for (const { threadId, badges: list, activityAt: at } of section.threads)
        if (!sectionOf.has(threadId)) {
          sectionOf.set(threadId, `${section.pluginId}\u0000${section.id}`);
          badges.set(threadId, { badges: list });
          if (at) activityAt.set(threadId, at);
        }
    return { badges, sectionOf, activityAt };
  }, [sections]);
  const navigate = useBbNavigate();
  const rpc = useRpc<typeof rpcContract>();
  const [createProjectOpen, setCreateProjectOpen] = useState(false);
  const [createProjectBusy, setCreateProjectBusy] = useState(false);
  const [createProjectError, setCreateProjectError] = useState<string | null>(
    null,
  );
  const [projectCreationHosts, setProjectCreationHosts] = useState<
    ProjectCreationHost[]
  >([]);
  const [projectBranches, setProjectBranches] = useState<
    Record<string, string | null>
  >({});
  const [collapsedProjects, setCollapsedProjects] = useState<Set<string>>(
    loadCollapsedProjects,
  );
  const [orderedProjectIds, setOrderedProjectIds] = useState<string[]>([]);
  const projectOrderRequestId = useRef(0);
  const projectSensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 200, tolerance: 6 },
    }),
  );
  const projectNames = useMemo(
    () => new Map(projects.map((project) => [project.id, project.name])),
    [projects],
  );
  // A claimed thread's descendants stay with it in its section.
  const claimOwners = useMemo(() => {
    const byId = new Map(threads.map((thread) => [thread.id, thread]));
    const owners = new Map<string, string>();
    for (const thread of threads) {
      let current: PluginSidebarThread | undefined = thread;
      const visited = new Set<string>();
      while (current && !visited.has(current.id)) {
        visited.add(current.id);
        if (claims.sectionOf.has(current.id)) {
          owners.set(thread.id, current.id);
          break;
        }
        current = current.parentThreadId
          ? byId.get(current.parentThreadId)
          : undefined;
      }
    }
    return owners;
  }, [threads, claims]);
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
    const matchedIds = new Set(
      threads
        .filter((thread) => {
          const project = projectNames.get(thread.projectId) ?? "";
          const title = thread.title ?? thread.titleFallback ?? "";
          const branch = thread.environment?.branchName ?? "";
          const badges = (
            claims.badges.get(claimOwners.get(thread.id) ?? "")?.badges ?? []
          )
            .map((badge) => badge.label)
            .join(" ");
          return `${title} ${project} ${branch} ${badges}`
            .toLocaleLowerCase()
            .includes(query);
        })
        .map((thread) => thread.id),
    );
    const byId = new Map(threads.map((thread) => [thread.id, thread]));
    for (const id of [...matchedIds]) {
      let parentId = byId.get(id)?.parentThreadId;
      const visited = new Set<string>([id]);
      while (parentId && byId.has(parentId) && !visited.has(parentId)) {
        visited.add(parentId);
        matchedIds.add(parentId);
        parentId = byId.get(parentId)?.parentThreadId;
      }
    }
    return threads.filter((thread) => matchedIds.has(thread.id));
  }, [projectNames, query, threads, claimOwners, claims]);
  const sectionGroups = useMemo(() => {
    const activity = (thread: PluginSidebarThread) =>
      Math.max(thread.updatedAt, thread.latestAttentionAt ?? 0);
    const latest = new Map(claims.activityAt);
    for (const thread of threads) {
      const owner = claimOwners.get(thread.id);
      if (owner)
        latest.set(owner, Math.max(latest.get(owner) ?? 0, activity(thread)));
    }
    const children = new Map<string, PluginSidebarThread[]>();
    const roots = [] as PluginSidebarThread[];
    for (const thread of visibleThreads) {
      const owner = claimOwners.get(thread.id);
      if (!owner) continue;
      if (owner === thread.id) roots.push(thread);
      else {
        const group = children.get(owner) ?? [];
        group.push(thread);
        children.set(owner, group);
      }
    }
    roots.sort(
      (a, b) =>
        (latest.get(b.id) ?? 0) - (latest.get(a.id) ?? 0) ||
        b.createdAt - a.createdAt ||
        a.id.localeCompare(b.id),
    );
    for (const group of children.values())
      group.sort(
        (a, b) => activity(b) - activity(a) || a.id.localeCompare(b.id),
      );
    const rootsBySection = new Map<string, PluginSidebarThread[]>();
    for (const root of roots) {
      const key = claims.sectionOf.get(root.id)!;
      rootsBySection.set(key, [...(rootsBySection.get(key) ?? []), root]);
    }
    return { rootsBySection, children };
  }, [threads, visibleThreads, claimOwners, claims]);
  const ordinaryThreads = useMemo(
    () => visibleThreads.filter((thread) => !claimOwners.has(thread.id)),
    [visibleThreads, claimOwners],
  );
  const pinnedThreads = useMemo(
    () => ordinaryThreads.filter((thread) => thread.isPinned),
    [ordinaryThreads],
  );
  const projectGroups = useMemo(() => {
    const pinnedIds = new Set(pinnedThreads.map((thread) => thread.id));
    const unpinned = ordinaryThreads.filter(
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
      return [
        {
          id: project.id,
          name: project.name,
          branchName: projectBranches[project.id] ?? null,
          threads: projectThreads,
        },
      ];
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
  }, [pinnedThreads, projectBranches, projects, query, ordinaryThreads]);
  const projectGroupsById = new Map(
    projectGroups.map((group) => [group.id, group]),
  );
  const orderedProjectGroups = orderedProjectIds
    .flatMap((id) => projectGroupsById.get(id) ?? [])
    .concat(
      projectGroups.filter((group) => !orderedProjectIds.includes(group.id)),
    );

  useEffect(() => {
    setOrderedProjectIds(projects.map((project) => project.id));
  }, [projectIdsKey]);

  const reorderProject = async (event: DragEndEvent) => {
    const activeId = String(event.active.id);
    const overId = event.over ? String(event.over.id) : null;
    if (!overId || activeId === overId) return;

    const sortableGroups = orderedProjectGroups.filter(
      (group) => group.id !== "unknown",
    );
    const oldIndex = sortableGroups.findIndex((group) => group.id === activeId);
    const newIndex = sortableGroups.findIndex((group) => group.id === overId);
    if (oldIndex === -1 || newIndex === -1) return;

    const nextGroups = arrayMove(sortableGroups, oldIndex, newIndex);
    const movedIndex = nextGroups.findIndex((group) => group.id === activeId);
    const requestId = ++projectOrderRequestId.current;
    setOrderedProjectIds(nextGroups.map((group) => group.id));

    try {
      const result = await rpc.call("reorderProject", {
        projectId: activeId,
        previousProjectId: nextGroups[movedIndex - 1]?.id ?? null,
        nextProjectId: nextGroups[movedIndex + 1]?.id ?? null,
      });
      if (requestId === projectOrderRequestId.current) {
        setOrderedProjectIds(result.projectIds);
      }
    } catch {
      if (requestId === projectOrderRequestId.current) {
        setOrderedProjectIds(projects.map((project) => project.id));
      }
    }
  };

  const openCreatedProject = (projectId: string) => {
    navigate.toCompose({ projectId, focusPrompt: true });
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
    return (
      <div className="px-4 py-6 text-sm text-muted-foreground">
        Loading threads…
      </div>
    );
  }
  if (status === "error") {
    return (
      <div className="px-4 py-6 text-sm text-destructive">
        Couldn’t load threads.
      </div>
    );
  }
  return (
    <AppearanceContext.Provider value={appearance}>
      <SectionThreadContext.Provider value={claims.badges}>
        <div className="space-y-2 py-1">
          {sections.map((section) => (
            <PluginSection
              key={`${section.pluginId}\u0000${section.id}`}
              section={section}
              activeThreadId={activeThreadId}
              onNavigate={onNavigate}
              roots={
                sectionGroups.rootsBySection.get(
                  `${section.pluginId}\u0000${section.id}`,
                ) ?? []
              }
              childrenByRoot={sectionGroups.children}
              projectNames={projectNames}
              expandAll={Boolean(query)}
            />
          ))}
          {pinnedThreads.length ? (
            <PinnedThreadsSection
              activeThreadId={activeThreadId}
              allThreads={ordinaryThreads}
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
            <DndContext
              collisionDetection={closestCenter}
              onDragEnd={(event) => void reorderProject(event)}
              sensors={projectSensors}
            >
              <SortableContext
                items={orderedProjectGroups
                  .filter((group) => group.id !== "unknown")
                  .map((group) => group.id)}
                strategy={verticalListSortingStrategy}
              >
                <div className="mt-1 space-y-2">
                  {orderedProjectGroups.map((group) => (
                    <SortableListItem
                      disabled={
                        Boolean(query) ||
                        group.id === "unknown" ||
                        projects.length < 2
                      }
                      id={group.id}
                      key={group.id}
                    >
                      <ProjectGroup
                        activeThreadId={activeThreadId}
                        collapsed={!query && collapsedProjects.has(group.id)}
                        group={group}
                        limitThreads={!query}
                        onNavigate={onNavigate}
                        onToggle={() => {
                          setCollapsedProjects((current) => {
                            const next = new Set(current);
                            if (next.has(group.id)) next.delete(group.id);
                            else next.add(group.id);
                            saveCollapsedProjects(next);
                            return next;
                          });
                        }}
                      />
                    </SortableListItem>
                  ))}
                </div>
              </SortableContext>
            </DndContext>
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
      </SectionThreadContext.Provider>
    </AppearanceContext.Provider>
  );
}

type ColorKey =
  "projectColor" | "branchColor" | "threadColor" | "childThreadColor";

const colorFields: readonly { key: ColorKey; label: string }[] = [
  { key: "projectColor", label: "Project name" },
  { key: "branchColor", label: "Branch name" },
  { key: "threadColor", label: "Thread name" },
  { key: "childThreadColor", label: "Child thread name" },
];

function AppearanceSettings() {
  const rpc = useRpc<typeof rpcContract>();
  const appearance = useAppearance();
  const [draft, setDraft] = useState<Appearance>(appearance);
  const [saving, setSaving] = useState(false);
  const parsed = appearanceSchema.safeParse(draft);

  useEffect(() => setDraft(appearance), [appearance]);

  const save = async () => {
    if (!parsed.success || saving) return;
    setSaving(true);
    try {
      setDraft(await rpc.call("updateAppearance", parsed.data));
      toast.success("Sidebar appearance saved");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Couldn’t save appearance",
      );
    } finally {
      setSaving(false);
    }
  };

  const reset = async () => {
    if (saving) return;
    setSaving(true);
    try {
      setDraft(await rpc.call("resetAppearance", {}));
      toast.success("Sidebar appearance reset");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Couldn’t reset appearance",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      className="max-w-xl space-y-5 rounded-lg border border-border p-4"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <div className="space-y-3">
        {colorFields.map(({ key, label }) => {
          const valid = /^$|^#[0-9a-fA-F]{6}$/.test(draft[key]);
          return (
            <label
              className="grid gap-2 sm:grid-cols-[1fr_auto_8rem] sm:items-center"
              key={key}
            >
              <span className="text-sm font-medium text-foreground">
                {label}
              </span>
              <input
                aria-label={`${label} color picker`}
                className="h-8 w-10 cursor-pointer rounded border border-input bg-transparent p-1"
                key={valid && draft[key] ? "color" : "theme"}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    [key]: event.target.value,
                  }))
                }
                type="color"
                value={valid && draft[key] ? draft[key] : undefined}
              />
              <input
                aria-invalid={!valid}
                className="h-8 rounded-md border border-input bg-background px-2 font-mono text-xs text-foreground outline-none focus:border-ring aria-[invalid=true]:border-destructive"
                maxLength={7}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    [key]: event.target.value,
                  }))
                }
                placeholder="Use theme"
                spellCheck={false}
                value={draft[key]}
              />
            </label>
          );
        })}
      </div>

      <label className="grid gap-2 sm:grid-cols-[1fr_12rem] sm:items-center">
        <span>
          <span className="block text-sm font-medium text-foreground">
            Thread indentation
          </span>
          <span className="text-xs text-muted-foreground">
            {draft.threadIndent}px from the left edge
          </span>
        </span>
        <input
          aria-label="Thread indentation"
          max={40}
          min={8}
          onChange={(event) =>
            setDraft((current) => ({
              ...current,
              threadIndent: event.target.valueAsNumber,
            }))
          }
          step={1}
          type="range"
          value={draft.threadIndent}
        />
      </label>

      <div className="rounded-md bg-muted/50 p-3">
        <div className="mx-2 flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium">
          <ChevronIcon collapsed={false} />
          <span style={{ color: draft.projectColor || undefined }}>
            Example project
          </span>
          <span
            className="flex items-center gap-1 opacity-75"
            style={{ color: draft.branchColor || undefined }}
          >
            <span aria-hidden="true">-</span>
            <BranchIcon />
            main
          </span>
        </div>
        <div
          className="mr-2 rounded-lg"
          style={{ marginLeft: draft.threadIndent }}
        >
          <div
            className="px-2.5 py-2 text-sm font-medium"
            style={{ color: draft.threadColor || undefined }}
          >
            Example thread
          </div>
        </div>
        <div className="ml-7 mr-2 border-l border-border/70 pl-1">
          <div
            className="py-[3px] pl-2 text-xs leading-5"
            style={{ color: draft.childThreadColor || undefined }}
          >
            Child thread
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <Button
          className="mr-auto"
          onClick={() =>
            void rpc.call("refreshSections", {}).then(
              () => toast.success("Sections refreshed"),
              () => toast.error("Couldn’t refresh sections"),
            )
          }
          size="sm"
          type="button"
          variant="ghost"
        >
          Refresh sections
        </Button>
        <Button
          disabled={saving}
          onClick={() => void reset()}
          size="sm"
          type="button"
          variant="outline"
        >
          Reset
        </Button>
        <Button disabled={saving || !parsed.success} size="sm" type="submit">
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>
    </form>
  );
}

export default definePluginApp((app) => {
  app.slots.settingsSection({
    id: "appearance",
    title: "Sidebar appearance",
    description:
      "Tune label colors and thread indentation. Empty colors use the BB theme.",
    component: AppearanceSettings,
  });
  app.slots.experimental_threadList({
    id: "thread-details",
    title: "Thread details",
    description: "Project and branch context with quick pin controls.",
    component: SidebarThreadList,
  });
});
