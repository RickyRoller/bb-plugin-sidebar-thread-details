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

/** An sdk.plugins stub where each provider id answers with `respond`. */
function sectionProviders(providers, calls = []) {
  return {
    experimental_discoverRpc: async ({ method }) =>
      Object.keys(providers).map((pluginId) => ({ pluginId, method })),
    callRpc: async (args) => {
      calls.push(args);
      return providers[args.pluginId](args);
    },
  };
}
const envoySection = (threads) => ({
  sections: [{ id: "envoys", title: "Envoys", order: 10, threads }],
});

test("A title badge stays on the first line, meta badges sit below, worktree context is visible unpinned, and native actions work", async () => {
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
        projects: [{ id: "project-1", name: "Web" }],
      },
      rpc: {
        getAppearance: () => ({}),
        projectBranches: () => ({}),
      },
      sdk: {
        plugins: sectionProviders({
          sages: () =>
            envoySection([
              {
                threadId: "thread-1",
                badges: [
                  {
                    label: "[APP-123]",
                    placement: "title",
                    href: "https://linear.app/acme/issue/APP-123",
                  },
                  {
                    label: "Server :8099",
                    tone: "success",
                    title: "Server running from /test/worktree",
                  },
                ],
              },
            ]),
        }),
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
    await waitFor(() => assert.ok(slot.queryByText("[APP-123]")));
    const issue = slot.getByText("[APP-123]");
    assert.equal(
      issue.getAttribute("href"),
      "https://linear.app/acme/issue/APP-123",
    );
    assert.ok(slot.queryByText("· BB worktree"));
    const row = slot.getByText("Fix saved-swap crash").closest('[role="link"]');
    assert.ok(row.contains(issue));
    const server = slot.getByText("Server :8099");
    assert.equal(server.getAttribute("href"), null);
    assert.equal(
      server.getAttribute("title"),
      "Server running from /test/worktree",
    );
    assert.ok(!issue.parentElement.contains(server));
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

test("Claimed threads own their pinned tasks and descendants, sort by latest task activity, and stay searchable by badge", async () => {
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
      projects: [{ id: "project-1", name: "Web" }],
    },
    rpc: {
      getAppearance: () => ({}),
      projectBranches: () => ({}),
      pinnedThreadOrder: () => ({ threadIds: [] }),
    },
    sdk: {
      plugins: sectionProviders({
        sages: () =>
          envoySection([
            {
              threadId: "envoy-a",
              badges: [{ label: "[APP-123]", placement: "title" }],
            },
            { threadId: "envoy-b" },
          ]),
      }),
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
    await slot.behavior.emitRealtime("sections-refresh", {});
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
        searchQuery: "APP-123",
      }),
    );
    assert.ok(slot.queryByText("First task"));
    assert.equal(slot.queryByText("Second task"), null);
  } finally {
    slot.lifecycle.unmount();
  }
});

test("Link sections render with nested links, skipping a malformed section and a failing provider", async () => {
  const calls = [];
  const slot = renderSlot(
    app.threadLists[0],
    { activeThreadId: null, onNavigate() {}, searchQuery: "" },
    {
      sidebarThreads: { status: "ready", threads: [], projects: [] },
      rpc: { getAppearance: () => ({}), projectBranches: () => ({}) },
      sdk: {
        plugins: sectionProviders(
          {
            broken: () => {
              throw new Error("down");
            },
            sages: ({ method, input }) =>
              method === "sidebar-section.v1.reorder"
                ? { ids: input.ids }
                : {
                    sections: [
                      { id: "bad", title: "" },
                      {
                        id: "sages",
                        title: "Sages",
                        reorderable: true,
                        links: [
                          {
                            id: "s1",
                            label: "Web sage",
                            path: "/plugins/sages/sages/s1",
                            children: [
                              {
                                id: "a1",
                                label: "Swap acolyte",
                                path: "/plugins/sages/sages/a1",
                              },
                            ],
                          },
                          {
                            id: "s2",
                            label: "Infra sage",
                            path: "/plugins/sages/sages/s2",
                          },
                        ],
                      },
                    ],
                  },
          },
          calls,
        ),
      },
    },
  );
  try {
    await waitFor(() => assert.ok(slot.queryByText("Web sage")));
    const section = slot.getByRole("region", { name: "Sages" });
    assert.ok(section.contains(slot.getByText("Swap acolyte")));
    assert.equal(
      slot.getByText("Infra sage").closest("a").getAttribute("href"),
      "http://localhost/plugins/sages/sages/s2",
    );
    assert.ok(
      calls.some(
        (call) =>
          call.pluginId === "broken" &&
          call.method === "sidebar-section.v1.get",
      ),
    );
  } finally {
    slot.lifecycle.unmount();
  }
});

test("A provider's refresh refetches only its sections, and its activityAt reorders claimed threads", async () => {
  const calls = [];
  let newest = "b";
  const thread = (id, updatedAt) => ({
    id, title: `Task ${id}`, updatedAt, createdAt: updatedAt, latestAttentionAt: updatedAt,
    projectId: "p", titleFallback: null, parentThreadId: null, sectionId: null, status: "idle",
    isUnread: false, isPinned: false, pinnedAt: null, archivedAt: null, isArchived: false,
    isHidden: false, indicator: "none", activity: {}, href: `/t/${id}`, environment: null,
  });
  const slot = renderSlot(
    app.threadLists[0],
    { activeThreadId: null, onNavigate() {}, searchQuery: "" },
    {
      sidebarThreads: { status: "ready", threads: [thread("a", 100), thread("b", 200)], projects: [{ id: "p", name: "P" }] },
      rpc: { getAppearance: () => ({}), projectBranches: () => ({}) },
      sdk: {
        plugins: sectionProviders(
          {
            sages: () => envoySection([
              { threadId: "a", activityAt: newest === "a" ? 9_000 : null },
              { threadId: "b" },
            ]),
            other: () => ({ sections: [{ id: "x", title: "Other", links: [{ id: "l", label: "Link", path: "/x" }] }] }),
          },
          calls,
        ),
      },
    },
  );
  const order = () =>
    [...slot.getByRole("region", { name: "Envoys" }).querySelectorAll("[data-sidebar-thread-id]")]
      .map((row) => row.dataset.sidebarThreadId);
  try {
    await waitFor(() => assert.deepEqual(order(), ["b", "a"]));
    assert.ok(slot.queryByText("Link"));
    const count = (pluginId) => calls.filter((c) => c.pluginId === pluginId).length;
    const [sagesBefore, otherBefore] = [count("sages"), count("other")];
    newest = "a";
    await slot.behavior.emitRealtime("sections-refresh", { pluginId: "sages" });
    await slot.behavior.emitRealtime("sections-refresh", { pluginId: "sages" });
    await waitFor(() => assert.deepEqual(order(), ["a", "b"]));
    assert.equal(count("sages"), sagesBefore + 1);
    assert.equal(count("other"), otherBefore);
    assert.ok(slot.queryByText("Link"));
  } finally {
    slot.lifecycle.unmount();
  }
});

test("A group row heads the threads it claims: an Envoy over its lanes, each lane over its own children", async () => {
  const base = {
    projectId: "project-1",
    titleFallback: null,
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
    environment: { id: "env-1", name: null, branchName: "bb/x", isWorktree: true, path: "/w" },
  };
  const thread = (id, title, parentThreadId = null) => ({
    ...base,
    id,
    title,
    parentThreadId,
    href: `/projects/project-1/threads/${id}`,
  });
  const slot = renderSlot(
    app.threadLists[0],
    { activeThreadId: null, onNavigate() {}, searchQuery: "" },
    {
      sidebarThreads: {
        status: "ready",
        threads: [
          thread("lane-1", "Theme tokens"),
          thread("worker-1", "device-validator run", "lane-1"),
          thread("plain", "Unrelated work"),
        ],
        projects: [{ id: "project-1", name: "Web" }],
      },
      rpc: { getAppearance: () => ({}), projectBranches: () => ({}) },
      sdk: {
        plugins: sectionProviders({
          sages: () => ({
            sections: [
              {
                id: "envoys",
                title: "Envoys",
                groups: [
                  {
                    id: "envoy-1",
                    label: "Dark mode",
                    path: "/plugins/sages/sages/chat-1",
                    icon: null,
                    kind: "Envoy",
                    threadKind: "Lane",
                    badges: [{ label: "[APP-4738]", placement: "title" }],
                    threads: [{ threadId: "lane-1", badges: [] }],
                  },
                  {
                    id: "envoy-2",
                    label: "Fresh Envoy",
                    path: "/plugins/sages/sages/chat-2",
                    kind: "Envoy",
                    threadKind: "Lane",
                    threads: [],
                  },
                ],
              },
            ],
          }),
        }),
      },
      threadActions: () => [],
    },
  );
  try {
    await waitFor(() => assert.ok(slot.queryByText("Dark mode")));
    const envoyLink = slot.getByText("Dark mode").closest("a");
    assert.ok(envoyLink.href.endsWith("/plugins/sages/sages/chat-1"));
    assert.ok(slot.queryByText("[APP-4738]"));
    assert.ok(slot.queryByText("· 1 lane"));
    assert.ok(slot.queryByText("· No lanes yet"));
    // The lane row sits under the Envoy, in the section, with no kind tag or
    // workspace label (every lane is a worktree).
    const lane = slot.getByText("Theme tokens");
    const laneRow = lane.closest("[data-sidebar-thread-id]");
    assert.ok(!laneRow.textContent.includes("Lane"));
    assert.ok(!laneRow.textContent.includes("BB worktree"));
    const envoys = slot.getByLabelText("Envoys");
    assert.ok(envoys.contains(lane));
    assert.ok(!envoys.textContent.includes("Unrelated work"));
    // Its child threads stay with it, one level further in.
    assert.ok(envoys.textContent.includes("1 children"));
    // The group folds its lanes away.
    fireEvent.click(slot.getByLabelText("Hide Dark mode's lanes"));
    assert.equal(slot.queryByText("Theme tokens"), null);
  } finally {
    slot.lifecycle.unmount();
  }
});
