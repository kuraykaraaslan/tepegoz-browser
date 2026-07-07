# @tepegoz/bookmarks CHECKLIST

Prepared from the package README only; implementation status was not inspected.

- [ ] Support creating bookmarks from valid web, file, and internal page URLs.
- [ ] Support rejecting unsafe bookmark schemes such as javascript, data, and blob.
- [ ] Support idempotent bookmark creation for the same URL.
- [ ] Support editing bookmark titles.
- [ ] Support editing bookmark URLs with bookmarkability validation.
- [ ] Support deleting bookmarks by stable identifier.
- [ ] Support searching bookmarks by title, URL, and normalized host.
- [ ] Support folder hierarchy for organizing bookmarks.
- [ ] Support creating, renaming, moving, and deleting bookmark folders.
- [ ] Support ordering bookmarks within a folder.
- [ ] Support moving bookmarks between folders.
- [ ] Support stable bookmark identifiers across app restarts.
- [ ] Support storing favicon metadata separately from user-entered titles.
- [ ] Support bookmark creation timestamps and update timestamps.
- [ ] Support recently added bookmark queries.
- [ ] Support bookmark existence checks for the current page star state.
- [ ] Support bulk import from common browser bookmark formats.
- [ ] Support bulk export to common browser bookmark formats.
- [ ] Support duplicate detection by normalized URL.
- [ ] Support preserving duplicates intentionally when users choose to keep both.
- [ ] Support bookmark descriptions or notes for richer saved items.
- [ ] Support keyword shortcuts for quick bookmark navigation.
- [ ] Support bookmark tags for cross-folder organization.
- [ ] Support pinned or favorite bookmark metadata.
- [ ] Support soft-delete or undo-friendly deletion metadata.
- [ ] Support migration-safe schema evolution for stored bookmark records.
- [ ] Support preload-safe DTOs for renderer and IPC use.
- [ ] Support app-free pure URL bookmarkability checks.
- [ ] Support defensive handling of malformed stored bookmark rows.
- [ ] Support future sync metadata without changing renderer-facing shapes.
