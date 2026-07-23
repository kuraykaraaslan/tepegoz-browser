# @tepegoz/bookmarks CHECKLIST

Status verified against the implementation (2026-07-23); checked items have concrete code backing them.

- [x] Support creating bookmarks from valid web, file, and internal page URLs.
- [x] Support rejecting unsafe bookmark schemes such as javascript, data, and blob.
- [ ] Support idempotent bookmark creation for the same URL.
- [x] Support editing bookmark titles.
- [ ] Support editing bookmark URLs with bookmarkability validation.
- [x] Support deleting bookmarks by stable identifier.
- [ ] Support searching bookmarks by title, URL, and normalized host.
- [x] Support folder hierarchy for organizing bookmarks.
- [x] Support creating, renaming, moving, and deleting bookmark folders.
- [x] Support ordering bookmarks within a folder.
- [x] Support moving bookmarks between folders.
- [x] Support stable bookmark identifiers across app restarts.
- [x] Support storing favicon metadata separately from user-entered titles.
- [x] Support bookmark creation timestamps and update timestamps.
- [x] Support recently added bookmark queries.
- [x] Support bookmark existence checks for the current page star state.
- [x] Support bulk import from common browser bookmark formats.
- [ ] Support bulk export to common browser bookmark formats.
- [ ] Support duplicate detection by normalized URL.
- [ ] Support preserving duplicates intentionally when users choose to keep both.
- [ ] Support bookmark descriptions or notes for richer saved items.
- [ ] Support keyword shortcuts for quick bookmark navigation.
- [ ] Support bookmark tags for cross-folder organization.
- [ ] Support pinned or favorite bookmark metadata.
- [ ] Support soft-delete or undo-friendly deletion metadata.
- [x] Support migration-safe schema evolution for stored bookmark records.
- [x] Support preload-safe DTOs for renderer and IPC use.
- [x] Support app-free pure URL bookmarkability checks.
- [ ] Support defensive handling of malformed stored bookmark rows.
- [ ] Support future sync metadata without changing renderer-facing shapes.
