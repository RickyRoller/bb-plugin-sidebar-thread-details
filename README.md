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


Envoy threads from Sages have their own **Envoys** section below Sages, including
pinned tasks. It sorts automatically by the latest activity across each task
and its child threads. Children stay with their Envoy; tasks do not repeat in
Pinned or Projects. Envoys show their Linear issue link beside the title and
project/workspace context below it, including for unpinned tasks. Metadata is
loaded in batches and refreshed when Sages updates a task. The thread action
menu uses BB's native controls, including deletion confirmation.
