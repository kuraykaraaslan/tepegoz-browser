# @tepegoz/page-context-menu CHECKLIST

Prepared from the package README only; implementation status was not inspected.

- [ ] Support building a page context menu model from right-click context.
- [ ] Support generic page actions such as back, forward, reload, save, print, and view source.
- [ ] Support inspect action placeholders for developer workflows.
- [ ] Support editable-field actions such as cut, copy, paste, and select all.
- [ ] Support text-selection actions such as copy and search selected text.
- [ ] Support link actions such as open, copy link, and save link.
- [ ] Support image actions such as open image, copy image, and save image.
- [ ] Support video and audio actions when media context is present.
- [ ] Support disabled placeholder rows when host actions are absent.
- [ ] Support keyboard-skipped disabled rows.
- [ ] Support localized strings owned by the package.
- [ ] Support pure menu-model generation without rendering.
- [ ] Support compatibility with the generic browser-menu MenuItem model.
- [ ] Support context data for navigation availability.
- [ ] Support context data for selected text.
- [ ] Support context data for link URL and source URL.
- [ ] Support context data for media type.
- [ ] Support context data for editability and edit command availability.
- [ ] Support host-provided popup rendering and positioning.
- [ ] Support host-provided clipboard and navigation callbacks.
- [ ] Support safe URL display and truncation in menu labels.
- [ ] Support search-provider hooks for selected text.
- [ ] Support copy-clean-link actions for tracking-parameter removal.
- [ ] Support translate-page and reading-mode placeholders.
- [ ] Support cast or media-route placeholders.
- [ ] Support open-in-new-tab, new-window, and private-window command slots.
- [ ] Support accessibility labels for context menu sections.
- [ ] Support deterministic snapshots for menu-model tests.
- [ ] Support future context kinds without changing the renderer menu component.
- [ ] Support bridge-agnostic use across native and in-window popup hosts.
