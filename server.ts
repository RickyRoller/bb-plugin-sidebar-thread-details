import { defineRpcContract, type BbPluginApi } from "@get-bb/plugin-sdk";
import { z } from "zod";
import { hostContract } from "./contract.js";
import { appearanceSchema, defaultAppearance } from "./appearance.js";

export const rpcContract = defineRpcContract({
  // A section provider's data changed: every open sidebar asks that provider
  // again (see sections.ts). Called by anything but a plugin, it asks all.
  refreshSections: {
    input: z.object({}).strict(),
    output: z.object({ ok: z.literal(true) }),
  },
  projectBranches: {
    input: z.object({ projectIds: z.array(z.string()) }),
    output: z.record(z.string(), z.string().nullable()),
  },
  projectCreationOptions: {
    input: z.object({}).strict(),
    output: z.object({
      hosts: z.array(z.object({ id: z.string(), name: z.string() })),
    }),
  },
  pickProjectFolder: {
    input: z.object({ hostId: z.string() }),
    output: z.object({
      project: z.object({ id: z.string(), name: z.string() }).nullable(),
    }),
  },
  renameProject: {
    input: z.object({ projectId: z.string(), name: z.string().min(1) }),
    output: z.object({ ok: z.literal(true) }),
  },
  removeProject: {
    input: z.object({ projectId: z.string() }),
    output: z.object({ ok: z.literal(true) }),
  },
  mainAndSync: {
    input: z.object({ projectId: z.string() }).strict(),
    output: z.object({ ok: z.literal(true) }).strict(),
  },
  reorderProject: {
    input: z.object({
      projectId: z.string(),
      previousProjectId: z.string().nullable(),
      nextProjectId: z.string().nullable(),
    }).strict(),
    output: z.object({ projectIds: z.array(z.string()) }).strict(),
  },
  reorderPinnedThread: {
    input: z.object({
      threadId: z.string(),
      previousThreadId: z.string().nullable(),
      nextThreadId: z.string().nullable(),
    }),
    output: z.object({ threadIds: z.array(z.string()) }),
  },
  pinnedThreadOrder: {
    input: z.object({}).strict(),
    output: z.object({ threadIds: z.array(z.string()) }),
  },
  getAppearance: {
    input: z.object({}).strict(),
    output: appearanceSchema,
  },
  updateAppearance: {
    input: appearanceSchema,
    output: appearanceSchema,
  },
  resetAppearance: {
    input: z.object({}).strict(),
    output: appearanceSchema,
  },
});

const APPEARANCE_KEY = "appearance";

async function getAppearance(bb: BbPluginApi) {
  const stored = await bb.storage.kv.get(APPEARANCE_KEY);
  const parsed = appearanceSchema.safeParse(stored);
  return parsed.success ? parsed.data : defaultAppearance;
}

async function getPinnedThreadOrder(bb: BbPluginApi) {
  const threads = await bb.sdk.threads.list({ archived: false });
  const pinnedThreads = threads.filter(
    (thread) => thread.pinnedAt !== null && thread.pinSortKey !== null,
  );
  const pinnedIds = new Set(pinnedThreads.map((thread) => thread.id));

  return pinnedThreads
    .filter(
      (thread) => !thread.parentThreadId || !pinnedIds.has(thread.parentThreadId),
    )
    .sort((left, right) => {
      if (left.pinSortKey! < right.pinSortKey!) return -1;
      if (left.pinSortKey! > right.pinSortKey!) return 1;
      if (left.id < right.id) return -1;
      if (left.id > right.id) return 1;
      return 0;
    })
    .map((thread) => thread.id);
}

export default function plugin(bb: BbPluginApi) {
  bb.log.info("Sidebar thread details loaded");
  const host = bb.hosts.experimental_client({ contract: hostContract });

  bb.rpc.register(rpcContract, {
    async refreshSections(_input, { experimental_caller: caller }) {
      bb.realtime.publish(
        "sections-refresh",
        caller.kind === "plugin" ? { pluginId: caller.pluginId } : {},
      );
      return { ok: true as const };
    },
    async projectBranches({ projectIds }) {
      const entries = await Promise.all(
        projectIds.map(async (projectId) => {
          try {
            const project = await bb.sdk.projects.get({ projectId });
            if (project.sources.length !== 1) return [projectId, null] as const;

            const result = await bb.sdk.projects.branches({
              projectId,
              hostId: project.sources[0].hostId,
            });
            const branch =
              result.checkout.kind === "branch"
                ? result.checkout.branchName
                : result.checkout.kind === "unborn"
                  ? result.checkout.branchName
                  : null;
            return [projectId, branch] as const;
          } catch {
            // A non-repository folder and a temporarily unavailable host both
            // degrade to showing only the project name.
            return [projectId, null] as const;
          }
        }),
      );
      return Object.fromEntries(entries);
    },
    async projectCreationOptions() {
      const hosts = await bb.sdk.hosts.list();
      return {
        hosts: hosts
          .filter((host) => host.status === "connected")
          .map((host) => ({ id: host.id, name: host.name })),
      };
    },
    async pickProjectFolder({ hostId }) {
      const { path } = await bb.sdk.hosts.pickFolder({
        hostId,
        clientHostId: hostId,
      });
      if (!path) return { project: null };

      const normalizedPath = path.trim().replace(/[\\/]+$/, "");
      const name = normalizedPath.split(/[\\/]/).at(-1)?.trim();
      if (!name) throw new Error("Choose a project folder.");

      const project = await bb.sdk.projects.create({
        name,
        source: { type: "local_path", hostId, path: normalizedPath },
      });
      return { project: { id: project.id, name: project.name } };
    },
    async renameProject({ projectId, name }) {
      await bb.sdk.projects.update({ projectId, name });
      return { ok: true as const };
    },
    async removeProject({ projectId }) {
      await bb.sdk.projects.delete({ projectId });
      return { ok: true as const };
    },
    async mainAndSync({ projectId }) {
      const project = await bb.sdk.projects.get({ projectId });
      const source = project.sources.find((candidate) => candidate.isDefault)
        ?? project.sources[0];
      if (!source) throw new Error("This project has no local path.");
      return host.call(
        "mainAndSync",
        { cwd: source.path },
        { hostId: source.hostId },
      );
    },
    async reorderProject({ projectId, previousProjectId, nextProjectId }) {
      const projects = await bb.sdk.projects.reorder({
        projectId,
        previousProjectId,
        nextProjectId,
      });
      return { projectIds: projects.map((project) => project.id) };
    },
    async reorderPinnedThread({ threadId, previousThreadId, nextThreadId }) {
      const threads = await bb.sdk.threads.reorderPinned({
        threadId,
        previousThreadId,
        nextThreadId,
      });
      return { threadIds: threads.map((thread) => thread.id) };
    },
    async pinnedThreadOrder() {
      return { threadIds: await getPinnedThreadOrder(bb) };
    },
    async getAppearance() {
      return getAppearance(bb);
    },
    async updateAppearance(appearance) {
      await bb.storage.kv.set(APPEARANCE_KEY, appearance);
      bb.realtime.publish("appearance", appearance);
      return appearance;
    },
    async resetAppearance() {
      await bb.storage.kv.delete(APPEARANCE_KEY);
      bb.realtime.publish("appearance", defaultAppearance);
      return defaultAppearance;
    },
  });
}
