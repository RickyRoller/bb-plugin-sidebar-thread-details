# Sidebar Thread Details

A bb frontend plugin that replaces the sidebar thread list with richer rows.

- Pinned threads show their project and checked-out branch.
- Pin/unpin appears beside the overflow menu on row hover or keyboard focus.
- Projects and pinned threads can be dragged into a custom order.
- **Main & Sync** checks out `main` and pulls the latest changes for a project.
- Sidebar appearance settings control project, branch, root-thread, and
  child-thread colors, plus root-thread indentation.
- Search, keyboard navigation, split dragging, unread state, and native thread
  actions remain available.

Enable **Thread details** under **Settings → Appearance → Sidebar** after
installing the plugin.


## Sections from other plugins

Other plugins add sections above Pinned. A plugin offers them by registering a
discoverable RPC (`bb.rpc.register(contract, handlers, { experimental_discoverable: true })`)
named `sidebar-section.v1.get`; the sidebar finds every such plugin with
`experimental_discoverRpc` and draws what it returns:

```ts
// input: the sidebar's thread ids, at most 1000 per call
{ threadIds: string[] }
// output
{ sections: {
  id: string; title: string;
  order?: number;          // lower first, then by plugin id
  links?: { id; label; path; icon?; badges?; children?: { id; label; path; icon?; badges? }[] }[];
  threads?: { threadId: string; badges?: Badge[]; activityAt?: number }[];
  reorderable?: boolean;   // links can be dragged
}[] }
// Badge: { label (≤ 40); tone?: neutral|info|success|warning|danger;
//          placement?: "title" | "meta"; href?: https URL; title?: tooltip }
```

Claimed threads leave Pinned and Projects and keep their child threads, sorted by
the latest activity across each group (the threads' own timestamps, or a
provider's `activityAt` when that is later: bb's timestamps lag a running turn),
with project and workspace context below the title. Search matches badge labels too. A dragged link order goes to
the provider's `sidebar-section.v1.reorder` (`{ sectionId, ids }` → `{ ids }`).
A provider that fails or returns a malformed section loses only that section.
When a provider's data changes it calls this plugin's `refreshSections` RPC
(input `{}`) through `bb.sdk.plugins.callRpc`. Every open sidebar then refetches
that provider's sections only, folding a burst of calls into one request. A
call from anything but a plugin, or from a provider not seen yet, finds and
asks every provider again, as does **Refresh sections** in this plugin's settings.

The Sages plugin provides the **Sages** and **Envoys** sections this way. The
thread action menu uses BB's native controls, including deletion confirmation.
