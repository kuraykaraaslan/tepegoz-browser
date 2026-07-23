# @tepegoz/page-context-menu CHECKLIST

Status verified against the implementation (2026-07-23); checked items have concrete code backing them.

- [x] Support building a page context menu model from right-click context.
- [x] Support generic page actions such as back, forward, reload, save, print, and view source.
- [x] Support inspect action placeholders for developer workflows.
- [x] Support editable-field actions such as cut, copy, paste, and select all.
- [x] Support text-selection actions such as copy and search selected text.
- [ ] Support link actions such as open, copy link, and save link.
- [x] Support image actions such as open image, copy image, and save image.
- [x] Support video and audio actions when media context is present.
- [x] Support disabled placeholder rows when host actions are absent.
- [x] Support keyboard-skipped disabled rows.
- [x] Support localized strings owned by the package.
- [x] Support pure menu-model generation without rendering.
- [x] Support compatibility with the generic browser-menu MenuItem model.
- [x] Support context data for navigation availability.
- [x] Support context data for selected text.
- [x] Support context data for link URL and source URL.
- [x] Support context data for media type.
- [x] Support context data for editability and edit command availability.
- [x] Support host-provided popup rendering and positioning.
- [x] Support host-provided clipboard and navigation callbacks.
- [ ] Support safe URL display and truncation in menu labels.
- [ ] Support search-provider hooks for selected text.
- [ ] Support copy-clean-link actions for tracking-parameter removal.
- [x] Support translate-page and reading-mode placeholders.
- [x] Support cast or media-route placeholders.
- [ ] Support open-in-new-tab, new-window, and private-window command slots.
- [ ] Support accessibility labels for context menu sections.
- [x] Support deterministic snapshots for menu-model tests.
- [x] Support future context kinds without changing the renderer menu component.
- [x] Support bridge-agnostic use across native and in-window popup hosts.
