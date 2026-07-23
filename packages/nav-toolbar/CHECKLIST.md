# @tepegoz/nav-toolbar CHECKLIST

Status verified against the implementation (2026-07-23); checked items have concrete code backing them.

- [x] Support back navigation button rendering.
- [x] Support forward navigation button rendering.
- [x] Support reload button rendering.
- [x] Support home button rendering.
- [x] Support disabled states for unavailable back and forward actions.
- [x] Support an address bar composed from the omnibox package.
- [x] Support a bookmark star when bookmark callbacks are supplied.
- [x] Support add-bookmark and remove-bookmark labels.
- [x] Support host-provided toolbar action slots.
- [x] Support host-provided main menu controls.
- [x] Support injected callbacks for every toolbar action.
- [x] Support localized aria labels supplied by the host.
- [x] Support a shared toolbar icon-button class for matching host controls.
- [x] Support keyboard focus order across all toolbar controls.
- [ ] Support tooltips for icon-only buttons.
- [ ] Support compact layout at narrow window widths.
- [ ] Support overflow behavior for action slots.
- [x] Support high-contrast focus rings.
- [ ] Support reduced-motion friendly hover and press states.
- [x] Support safe truncation in the omnibox area.
- [ ] Support touch-friendly hit targets.
- [ ] Support RTL layout for localized interfaces.
- [x] Support theme tokens from browser chrome.
- [ ] Support loading-state affordances for reload or stop actions.
- [ ] Support optional stop-loading action in place of reload.
- [ ] Support page security indicators supplied through the omnibox area.
- [x] Support extension action icons beside the address bar.
- [x] Support bridge-agnostic operation through injected props.
- [x] Support test rendering with mock callbacks.
- [x] Support future toolbar controls without changing navigation callbacks.
