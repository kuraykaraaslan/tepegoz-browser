# @tepegoz/browser-chrome CHECKLIST

Prepared from the package README only; implementation status was not inspected.

- [ ] Support composing title row, tab strip, window controls, and navigation toolbar.
- [ ] Support frameless-window drag regions that avoid interactive controls.
- [ ] Support injected window minimize, maximize, restore, and close actions.
- [ ] Support maximized and restored visual states.
- [ ] Support active tab selection through injected tab callbacks.
- [ ] Support closing tabs through injected tab callbacks.
- [ ] Support creating new tabs through an injected action.
- [ ] Support tab context-menu entry points.
- [ ] Support tab group data and group actions from the host.
- [ ] Support pinned tabs and regular tabs in the chrome layout.
- [ ] Support back, forward, reload, home, and navigate actions.
- [ ] Support current URL display through the nav toolbar.
- [ ] Support bookmark star state and toggle actions.
- [ ] Support an extension or action tray slot beside the omnibox.
- [ ] Support a caption-leading slot for notifications or app-level controls.
- [ ] Support a host-provided main menu control.
- [ ] Support localized labels supplied as a composed string object.
- [ ] Support dense desktop layout without text clipping.
- [ ] Support responsive behavior for narrow windows.
- [ ] Support focus order across tabs, toolbar buttons, omnibox, and menu.
- [ ] Support high-contrast visual states for active and inactive windows.
- [ ] Support reduced-motion friendly tab and toolbar transitions.
- [ ] Support safe rendering of long tab titles.
- [ ] Support loading indicators on tabs and navigation affordances.
- [ ] Support disabled states for unavailable navigation actions.
- [ ] Support keyboard shortcuts surfaced through host callbacks.
- [ ] Support toolbar customization slots without owning app state.
- [ ] Support theme tokens inherited from the desktop shell.
- [ ] Support clear separation between browser content and trusted chrome.
- [ ] Support testable rendering with fully injected data and callbacks.
