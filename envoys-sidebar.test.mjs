import assert from "node:assert/strict";
import { test } from "node:test";
import { JSDOM } from "jsdom";
const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost",
  pretendToBeVisual: true,
});
for (const name of [
  "window",
  "document",
  "navigator",
  "HTMLElement",
  "Element",
  "Node",
  "NodeFilter",
  "MutationObserver",
  "CustomEvent",
  "Event",
  "MouseEvent",
  "DocumentFragment",
  "HTMLInputElement",
]) {
  Object.defineProperty(globalThis, name, {
    configurable: true,
    value: dom.window[name],
  });
}
globalThis.getComputedStyle = dom.window.getComputedStyle.bind(dom.window);
globalThis.requestAnimationFrame = dom.window.requestAnimationFrame.bind(
  dom.window,
);
globalThis.cancelAnimationFrame = dom.window.cancelAnimationFrame.bind(
  dom.window,
);
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { act, fireEvent, waitFor } = await import("@testing-library/react");
const { loadPluginApp, renderSlot } =
  await import("@get-bb/plugin-sdk/testing/app");
const { definePluginApp } = await import("@get-bb/plugin-sdk/app");
const definition = (await import("./app.tsx")).default;
const app = await loadPluginApp(definition);

test("Envoy issue stays on the first line, worktree context is visible unpinned, and native actions work", async () => {
  let deleted = false;
  const thread = {
    id: "thread-1",
    projectId: "project-1",
    title: "Fix saved-swap crash",
    titleFallback: null,
    parentThreadId: null,
    sectionId: null,
    status: "idle",
    isUnread: false,
    isPinned: false,
    pinnedAt: null,
    archivedAt: null,
    isArchived: false,
    isHidden: false,
    indicator: "none",
    activity: {},
    createdAt: 1,
    updatedAt: 1,
    href: "/projects/project-1/threads/thread-1",
    environment: {
      id: "env-1",
      name: null,
      branchName: "bb/fix",
      isWorktree: true,
      path: "/test/worktree",
    },
  };
  const slot = renderSlot(
    app.threadLists[0],
    { activeThreadId: null, onNavigate() {}, searchQuery: "" },
    {
      sidebarThreads: {
        status: "ready",
        threads: [thread],
        projects: [{ id: "project-1", name: "Wallet" }],
      },
      rpc: {
        getAppearance: () => ({}),
        projectBranches: () => ({}),
      },
      sdk: {
        plugins: {
          callRpc: async (args) => {
            if (args.method === "envoys_summaries")
              return {
                envoys: [
                  {
                    threadId: "thread-1",
                    lifecycle: "active",
                    issue: {
                      key: "WAL-123",
                      url: "https://linear.app/wallet/issue/WAL-123",
                    },
                  },
                ],
              };
            return { sages: [] };
          },
        },
      },
      threadActions: () => [
        {
          key: "bb--core/delete",
          pluginId: "bb--core",
          group: "danger",
          action: {
            label: "Delete…",
            run: async () => {
              deleted = true;
            },
          },
        },
      ],
    },
  );
  try {
    await waitFor(() => assert.ok(slot.queryByText("[WAL-123]")));
    const issue = slot.getByText("[WAL-123]");
    assert.equal(
      issue.getAttribute("href"),
      "https://linear.app/wallet/issue/WAL-123",
    );
    assert.ok(slot.queryByText("· BB worktree"));
    const row = slot.getByText("Fix saved-swap crash").closest('[role="link"]');
    assert.ok(row.contains(issue));
    fireEvent.click(issue);
    assert.ok(
      !slot.inspection.navigateCalls.some((call) => call.method === "toThread"),
      JSON.stringify(slot.inspection.navigateCalls),
    );
    fireEvent.click(slot.getByText("Fix saved-swap crash"));
    assert.ok(
      slot.inspection.navigateCalls.some((call) => call.method === "toThread"),
    );
    fireEvent.click(
      document.querySelector(
        '[aria-label="More actions for Fix saved-swap crash"]',
      ),
    );
    fireEvent.click(slot.getByText("Delete…"));
    await waitFor(() => assert.equal(deleted, true));
  } finally {
    slot.lifecycle.unmount();
  }
});

test("Envoys own their pinned tasks and descendants, sort by latest task activity, and stay searchable", async () => {
  const makeThread = (id, title, updatedAt, extra = {}) => ({
    id,
    title,
    updatedAt,
    createdAt: updatedAt,
    projectId: "project-1",
    titleFallback: null,
    parentThreadId: null,
    sectionId: null,
    status: "idle",
    isUnread: false,
    isPinned: false,
    pinnedAt: null,
    archivedAt: null,
    isArchived: false,
    isHidden: false,
    indicator: "none",
    activity: {},
    latestAttentionAt: updatedAt,
    href: `/projects/project-1/threads/${id}`,
    environment: null,
    ...extra,
  });
  const threads = [
    makeThread("envoy-b", "Second task", 200, {
      isPinned: true,
      status: "active",
    }),
    makeThread("ordinary", "Ordinary project chat", 900),
    makeThread("grandchild", "Deep worker", 350, { parentThreadId: "child" }),
    makeThread("envoy-a", "First task", 100),
    makeThread("child", "Task specialist", 300, {
      parentThreadId: "envoy-a",
      isPinned: true,
    }),
  ];
  const props = { activeThreadId: null, onNavigate() {}, searchQuery: "" };
  const slot = renderSlot(app.threadLists[0], props, {
    sidebarThreads: {
      status: "ready",
      threads,
      projects: [{ id: "project-1", name: "Wallet" }],
    },
    rpc: {
      getAppearance: () => ({}),
      projectBranches: () => ({}),
      pinnedThreadOrder: () => ({ threadIds: [] }),
    },
    sdk: {
      plugins: {
        callRpc: async ({ method }) =>
          method === "envoys_summaries"
            ? {
                envoys: [
                  {
                    threadId: "envoy-a",
                    lifecycle: "active",
                    issue: {
                      key: "WAL-123",
                      url: "https://linear.app/wallet/issue/WAL-123",
                    },
                  },
                  { threadId: "envoy-b", lifecycle: "active", issue: null },
                ],
              }
            : { sages: [] },
      },
    },
  });
  const rootOrder = () =>
    [
      ...slot
        .getByRole("region", { name: "Envoys" })
        .querySelectorAll('[role="link"]'),
    ].map(
      (row) =>
        row.querySelector("[data-sidebar-thread-id]")?.dataset
          .sidebarThreadId ?? row.dataset.sidebarThreadId,
    );
  try {
    await waitFor(() => assert.ok(slot.queryByText("Envoys")));
    const section = slot.getByRole("region", { name: "Envoys" });
    assert.deepEqual(rootOrder(), ["envoy-a", "envoy-b"]);
    assert.equal(slot.queryByText("Pinned"), null);
    assert.equal(slot.getAllByText("First task").length, 1);
    assert.equal(slot.getAllByText("Second task").length, 1);
    assert.ok(!section.contains(slot.getByText("Ordinary project chat")));
    fireEvent.click(slot.getByText("2 children"));
    assert.ok(section.contains(slot.getByText("Deep worker")));
    assert.ok(section.contains(slot.getByText("Task specialist")));
    assert.equal(slot.getAllByText("Task specialist").length, 1);

    // The harness retains the fixture array. Publish a summary refresh after
    // changing it so the slot receives a fresh render of the host snapshot.
    threads[0] = { ...threads[0], updatedAt: 400, latestAttentionAt: 400 };
    await slot.behavior.emitRealtime("envoys-refresh", {});
    await waitFor(() => assert.deepEqual(rootOrder(), ["envoy-b", "envoy-a"]));
    const { createElement } = await import("react");
    slot.lifecycle.rerender(
      createElement(app.threadLists[0].component, {
        ...props,
        searchQuery: "Deep worker",
      }),
    );
    assert.ok(slot.queryByText("First task"));
    assert.ok(slot.queryByText("Deep worker"));
    assert.equal(slot.queryByText("Second task"), null);
    assert.equal(slot.queryByText("Ordinary project chat"), null);
    slot.lifecycle.rerender(
      createElement(app.threadLists[0].component, {
        ...props,
        searchQuery: "WAL-123",
      }),
    );
    assert.ok(slot.queryByText("First task"));
    assert.equal(slot.queryByText("Second task"), null);
  } finally {
    slot.lifecycle.unmount();
  }
});
