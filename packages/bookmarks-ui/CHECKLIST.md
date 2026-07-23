# @tepegoz/bookmarks-ui CHECKLIST

Status verified against the implementation (2026-07-23); checked items have concrete code backing them.

- [x] Support a two-pane bookmark manager with folders on the left and contents on the right.
- [x] Support creating folders from the selected folder context.
- [x] Support renaming bookmark folders.
- [ ] Support deleting bookmark folders with clear confirmation hooks.
- [ ] Support creating bookmarks from the manager.
- [ ] Support editing bookmark title and URL fields.
- [x] Support deleting bookmarks from row actions.
- [x] Support drag-reordering bookmarks within a folder.
- [x] Support dragging bookmarks into folders in the tree.
- [x] Support dragging folders within the folder tree.
- [x] Support preventing invalid moves such as moving a folder into itself.
- [x] Support search across the full bookmark tree.
- [x] Support clearing search and returning to the previous folder selection.
- [ ] Support keyboard navigation for tree nodes and content rows.
- [ ] Support accessible tree semantics for nested folders.
- [ ] Support accessible grid or list semantics for folder contents.
- [x] Support context-menu triggers for bookmarks and folders.
- [x] Support host-rendered native context menus.
- [x] Support opening bookmark URLs through injected navigation callbacks.
- [ ] Support opening multiple selected bookmarks through host actions.
- [ ] Support multi-select for batch move and delete workflows.
- [ ] Support visible breadcrumbs for the selected folder.
- [x] Support empty-folder and no-search-results states.
- [x] Support optimistic refresh after host mutations.
- [ ] Support loading, error, and retry states for tree retrieval.
- [x] Support localized labels from the package dictionary.
- [x] Support favicon display with safe fallback icons.
- [ ] Support sorting by manual order, title, URL, and creation date.
- [ ] Support import and export entry points supplied by the host.
- [ ] Support responsive layout for narrow settings-style windows.
