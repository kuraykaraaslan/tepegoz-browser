# @tepegoz/newtab-ui CHECKLIST

Status verified against the implementation (2026-07-23); checked items have concrete code backing them.

- [x] Support a tepegoz new-tab start page.
- [ ] Support a segmented chooser for Favorites, AI, and Blank views.
- [ ] Support Favorites as the default new-tab view.
- [ ] Support loading favorite bookmarks through injected callbacks.
- [x] Support opening favorites through injected navigation callbacks.
- [x] Support an AI entry point through an injected callback.
- [ ] Support a blank start view with no distracting content.
- [x] Support empty state when no favorites exist.
- [ ] Support loading and retry states for favorites.
- [ ] Support favorite cards with title, URL, and favicon fallback.
- [ ] Support keyboard navigation across chooser options.
- [x] Support keyboard navigation across favorite cards.
- [ ] Support accessible labels for chooser tabs and favorite actions.
- [x] Support localized English and Turkish strings from the package.
- [ ] Support responsive layout for small browser windows.
- [x] Support a clear visual brand mark.
- [x] Support safe truncation for long favorite titles and URLs.
- [ ] Support search or filtering within favorites.
- [ ] Support pinned favorite ordering supplied by the host.
- [ ] Support quick actions for opening favorites in new tabs.
- [ ] Support drag-reordering favorites when host callbacks are supplied.
- [x] Support privacy-friendly rendering without browsing-history leakage.
- [ ] Support reduced-motion friendly transitions between views.
- [ ] Support high-contrast color treatment.
- [x] Support theme-aware rendering for light and dark modes.
- [ ] Support click targets suitable for touch devices.
- [ ] Support host-provided error messages for favorite loading failures.
- [ ] Support stable selection state within a tab session.
- [x] Support bridge-agnostic operation through injected data and callbacks.
- [ ] Support future new-tab modules without coupling to desktop internals.
