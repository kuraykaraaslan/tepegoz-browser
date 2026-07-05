# @tepegoz/bookmarks-ui

Presentational chrome leaf: the `tepegoz://bookmarks` manager (Chrome-style) — a two-pane layout
with a folder tree on the left and the selected folder's contents on the right. Supports @dnd-kit
drag-reorder within a folder, drag-into-tree-folder to reparent, search across the whole tree, a
New-folder action, and right-click rows that defer to the host's native context menu. The tree data,
every mutation, and navigation are all injected (`getTree`/`onMove`/`onNewFolder`/`onOpen`/
`onContextMenu` + a `refreshKey` the host bumps after any mutation to trigger a refetch). Unlike most
of the other chrome leaves in this batch, it does own its own dictionary (`./i18n`, `useT
(bookmarksUiDict)`) — the main process also reuses that dictionary for the `tepegoz://bookmarks` tab
title. It has no dependency on the Electron bridge.

## Exports
- **`BookmarksManager`** — the two-pane bookmark manager view.
- **`BookmarkManagerNode`** — a tree node the manager renders (`id`, `type`, `title`, `url`,
  optional `favicon`, `children`); structurally compatible with the host's richer
  `BookmarkTreeNode`.
- **`BookmarkNodeType`** — `'folder' | 'bookmark'`.
- **`BookmarksManagerProps`** — the full injected-props contract.
- **`bookmarksUiDict`** / **`BookmarksUiStrings`** — the package's own i18n dictionary.

## Usage
```tsx
<BookmarksManager
  getTree={() => window.tepegoz.bookmarks.getTree()}
  refreshKey={refreshKey}
  onMove={(id, newParentId, index) => window.tepegoz.bookmarks.move(id, newParentId, index)}
  onNewFolder={(parentId) => promptNewFolder(parentId)}
  onOpen={(url) => navigate(url)}
  onContextMenu={(id, type) => openBookmarkMenu(id, type)}
/>
```

## Scripts
`pnpm typecheck` · `pnpm lint` · `pnpm test`
