# @tepegoz/browser-menu CHECKLIST

Status verified against the implementation (2026-07-23); checked items have concrete code backing them.

- [x] Support rendering generic action menu items from a data model.
- [x] Support separators between menu groups.
- [x] Support section labels for grouped browser commands.
- [x] Support header rows for account, profile, or contextual metadata.
- [x] Support inline zoom controls with decrement, reset, and increment actions.
- [x] Support grouped icon-button rows for compact command clusters.
- [x] Support submenu parent rows with host-managed flyout behavior.
- [x] Support keyboard navigation with Up, Down, Home, and End keys.
- [x] Support Enter and Space activation for selectable rows.
- [x] Support Escape dismissal through host-managed popup behavior.
- [x] Support disabled rows that are skipped by keyboard navigation.
- [x] Support visible shortcut hints for common browser commands.
- [x] Support destructive action styling when requested by the model.
- [x] Support icons supplied by the caller for individual actions.
- [ ] Support checkable menu items for toggled browser preferences.
- [ ] Support radio-style groups for mutually exclusive choices.
- [x] Support nested flyout open and close events with row geometry.
- [x] Support auto-focus on first enabled item.
- [ ] Support typeahead search within long menus.
- [x] Support screen-reader friendly roles and aria labels.
- [x] Support pointer hover without stealing keyboard focus unexpectedly.
- [ ] Support touch-friendly row sizing for hybrid devices.
- [ ] Support long labels and localized strings without clipping.
- [ ] Support RTL layout for localized menu content.
- [x] Support host-provided top-level dismissal and positioning.
- [x] Support reusable menu models for main menu and page context menu.
- [x] Support safe no-op behavior for rows with no action.
- [x] Support visual density consistent with desktop browser menus.
- [x] Support theme tokens from the shared UI layer.
- [x] Support deterministic item IDs for analytics and testing.
