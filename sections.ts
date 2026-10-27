// Sections other plugins add to the sidebar, above Pinned.
//
// A plugin offers sections by registering a discoverable RPC contract with
// SECTION_METHOD (see README). The sidebar finds every such plugin, asks each
// for its sections and draws them: plain links (the Sages plugin's sages) and
// threads it claims, which leave Pinned and Projects and keep their children.
// Rows carry the provider's badges. Everything is data, so a provider never
// runs code inside this plugin.
import { z } from "zod";

export const SECTION_METHOD = "sidebar-section.v1.get";
export const SECTION_REORDER_METHOD = "sidebar-section.v1.reorder";

export const badgeSchema = z.object({
  label: z.string().min(1).max(40),
  tone: z
    .enum(["neutral", "info", "success", "warning", "danger"])
    .catch("neutral")
    .default("neutral"),
  /** "title" sits beside the row's title; "meta" on the line below it. */
  placement: z.enum(["title", "meta"]).catch("meta").default("meta"),
  href: z.url({ protocol: /^https$/ }).nullish().catch(null),
  title: z.string().max(500).nullish(),
});
export type Badge = z.infer<typeof badgeSchema>;

const badgesSchema = z.array(badgeSchema).max(8).catch([]).default([]);
const linkBase = {
  id: z.string().min(1),
  label: z.string().min(1).max(200),
  /** An in-app path, such as /plugins/sages/sages/<id>. */
  path: z.string().startsWith("/"),
  icon: z.string().nullish(),
  badges: badgesSchema,
};
const linkSchema = z.object({
  ...linkBase,
  children: z.array(z.object(linkBase)).max(200).default([]),
});
export type SectionLink = z.infer<typeof linkSchema>;

export const sectionSchema = z.object({
  id: z.string().min(1).max(100),
  title: z.string().min(1).max(60),
  /** Lower draws first; ties sort by plugin id. */
  order: z.number().default(0),
  links: z.array(linkSchema).max(500).default([]),
  /**
   * Threads drawn here with their child threads, latest activity first.
   * `activityAt` (epoch ms) is activity the provider knows of that the
   * thread's own timestamps may not show yet, such as a turn starting.
   */
  threads: z
    .array(
      z.object({
        threadId: z.string(),
        badges: badgesSchema,
        activityAt: z.number().nullish().catch(null),
      }),
    )
    .max(1000)
    .default([]),
  /** Links can be dragged; the order goes to SECTION_REORDER_METHOD. */
  reorderable: z.boolean().default(false),
});
export const sectionsOutputSchema = z.object({
  sections: z.array(z.unknown()).max(20),
});
export type Section = z.infer<typeof sectionSchema> & { pluginId: string };

/**
 * Parses one provider's pages. A malformed section is dropped alone, so one
 * bad provider row never blanks the others; pages of the same section (one
 * per thousand thread ids) are joined.
 */
export function mergeSections(
  pluginId: string,
  pages: readonly z.infer<typeof sectionsOutputSchema>[],
): Section[] {
  const byId = new Map<string, Section>();
  for (const page of pages)
    for (const raw of page.sections) {
      const parsed = sectionSchema.safeParse(raw);
      if (!parsed.success) continue;
      const current = byId.get(parsed.data.id);
      if (!current) byId.set(parsed.data.id, { ...parsed.data, pluginId });
      else {
        current.threads.push(...parsed.data.threads);
        if (!current.links.length) current.links = parsed.data.links;
      }
    }
  return [...byId.values()];
}

export function sortSections(sections: Section[]): Section[] {
  return sections.sort(
    (a, b) =>
      a.order - b.order ||
      a.pluginId.localeCompare(b.pluginId) ||
      a.id.localeCompare(b.id),
  );
}
