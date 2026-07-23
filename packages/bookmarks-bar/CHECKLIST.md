# @tepegoz/bookmarks-bar CHECKLIST

Status verified against the implementation (2026-07-23); checked items have concrete code backing them.

- [x] Support a horizontal bookmarks strip below the navigation toolbar.
- [x] Support opening a bookmark through an injected callback.
- [x] Support rendering bookmark titles with sensible truncation.
- [x] Support displaying favicons with a readable fallback.
- [x] Support an empty state for users with no visible bookmarks.
- [x] Support overflow scrolling when bookmarks exceed available width.
- [ ] Support keyboard navigation across visible bookmark chips.
- [x] Support screen-reader labels for the bar and each bookmark.
- [x] Support tooltips for truncated bookmark titles and URLs.
- [x] Support context-menu entry points on individual bookmarks.
- [x] Support context-menu entry points on empty bar space.
- [x] Support drag-reordering visible bookmarks.
- [x] Support dragging bookmarks into folders exposed on the bar.
- [x] Support folder buttons that reveal nested bookmark menus.
- [x] Support opening a bookmark in the current tab.
- [x] Support opening a bookmark in a new tab through host actions.
- [x] Support opening a bookmark in a background tab through host actions.
- [x] Support hiding or showing the bar based on host preference.
- [ ] Support compact density for small window widths.
- [ ] Support high-contrast and reduced-motion friendly rendering.
- [x] Support host-provided localized labels only.
- [ ] Support bookmark chips with stable focus after list updates.
- [ ] Support responsive collapse into an overflow menu.
- [ ] Support visual distinction for internal pages, files, and web URLs.
- [ ] Support disabled or unavailable bookmark states from the host.
- [ ] Support hover, active, focus, and pressed interaction states.
- [ ] Support safe rendering of long, unusual, or RTL bookmark titles.
- [ ] Support touch-friendly hit targets.
- [x] Support deterministic item keys for smooth reordering.
- [x] Support theming through the surrounding browser chrome tokens.
