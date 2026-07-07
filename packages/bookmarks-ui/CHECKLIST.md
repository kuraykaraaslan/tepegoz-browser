# @tepegoz/bookmarks-ui CHECKLIST

Prepared from the package README only; implementation status was not inspected.

- [ ] Support a two-pane bookmark manager with folders on the left and contents on the right.
- [ ] Support creating folders from the selected folder context.
- [ ] Support renaming bookmark folders.
- [ ] Support deleting bookmark folders with clear confirmation hooks.
- [ ] Support creating bookmarks from the manager.
- [ ] Support editing bookmark title and URL fields.
- [ ] Support deleting bookmarks from row actions.
- [ ] Support drag-reordering bookmarks within a folder.
- [ ] Support dragging bookmarks into folders in the tree.
- [ ] Support dragging folders within the folder tree.
- [ ] Support preventing invalid moves such as moving a folder into itself.
- [ ] Support search across the full bookmark tree.
- [ ] Support clearing search and returning to the previous folder selection.
- [ ] Support keyboard navigation for tree nodes and content rows.
- [ ] Support accessible tree semantics for nested folders.
- [ ] Support accessible grid or list semantics for folder contents.
- [ ] Support context-menu triggers for bookmarks and folders.
- [ ] Support host-rendered native context menus.
- [ ] Support opening bookmark URLs through injected navigation callbacks.
- [ ] Support opening multiple selected bookmarks through host actions.
- [ ] Support multi-select for batch move and delete workflows.
- [ ] Support visible breadcrumbs for the selected folder.
- [ ] Support empty-folder and no-search-results states.
- [ ] Support optimistic refresh after host mutations.
- [ ] Support loading, error, and retry states for tree retrieval.
- [ ] Support localized labels from the package dictionary.
- [ ] Support favicon display with safe fallback icons.
- [ ] Support sorting by manual order, title, URL, and creation date.
- [ ] Support import and export entry points supplied by the host.
- [ ] Support responsive layout for narrow settings-style windows.
