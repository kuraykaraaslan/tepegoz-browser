# @tepegoz/bookmarks

Bookmarks feature module (L1). Owns:

- **`BookmarkStore`** — CRUD/search over the `bookmarks` table (idempotent on URL). Operates on a
  `Db` injected by the desktop app; the table schema itself lives in `@tepegoz/persistence`
  migrations.
- **`isBookmarkable(url)`** — the scheme allow-list deciding which URLs may be bookmarked. Shared by
  the renderer (whether to show the star) and the main-process IPC guard. Broader than
  `@tepegoz/navigation`'s `isWebUrl`: `http(s)`, `file://` and `tepegoz://` internal pages are
  bookmarkable; `javascript:`/`data:`/`blob:`/`chrome:`/`about:` are not.
- **`BookmarkEntry`** — the row/DTO shape shared with the IPC contract.

Pure and app-free (the store takes `Db`, `isBookmarkable` is a pure function), so the rule is safe to
import from the sandboxed renderer without pulling in native modules.
