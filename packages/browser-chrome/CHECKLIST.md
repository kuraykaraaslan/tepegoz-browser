# @tepegoz/browser-chrome CHECKLIST

Status verified against the implementation (2026-07-23); checked items have concrete code backing them.

- [x] Support composing title row, tab strip, window controls, and navigation toolbar.
- [x] Support frameless-window drag regions that avoid interactive controls.
- [x] Support injected window minimize, maximize, restore, and close actions.
- [x] Support maximized and restored visual states.
- [x] Support active tab selection through injected tab callbacks.
- [x] Support closing tabs through injected tab callbacks.
- [x] Support creating new tabs through an injected action.
- [x] Support tab context-menu entry points.
- [x] Support tab group data and group actions from the host.
- [x] Support pinned tabs and regular tabs in the chrome layout.
- [x] Support back, forward, reload, home, and navigate actions.
- [x] Support current URL display through the nav toolbar.
- [x] Support bookmark star state and toggle actions.
- [x] Support an extension or action tray slot beside the omnibox.
- [x] Support a caption-leading slot for notifications or app-level controls.
- [x] Support a host-provided main menu control.
- [x] Support localized labels supplied as a composed string object.
- [ ] Support dense desktop layout without text clipping.
- [x] Support responsive behavior for narrow windows.
- [x] Support focus order across tabs, toolbar buttons, omnibox, and menu.
- [ ] Support high-contrast visual states for active and inactive windows.
- [ ] Support reduced-motion friendly tab and toolbar transitions.
- [x] Support safe rendering of long tab titles.
- [ ] Support loading indicators on tabs and navigation affordances.
- [x] Support disabled states for unavailable navigation actions.
- [ ] Support keyboard shortcuts surfaced through host callbacks.
- [x] Support toolbar customization slots without owning app state.
- [x] Support theme tokens inherited from the desktop shell.
- [x] Support clear separation between browser content and trusted chrome.
- [x] Support testable rendering with fully injected data and callbacks.
