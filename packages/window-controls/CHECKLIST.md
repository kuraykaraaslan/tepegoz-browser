# @tepegoz/window-controls CHECKLIST

Status verified against the implementation (2026-07-23); checked items have concrete code backing them.

- [x] Support minimize caption button rendering.
- [x] Support maximize caption button rendering.
- [x] Support restore caption button rendering.
- [x] Support close caption button rendering.
- [x] Support swapping maximize and restore icon based on window state.
- [x] Support injected minimize action.
- [x] Support injected maximize or restore toggle action.
- [x] Support injected close action.
- [x] Support localized aria labels supplied by the host.
- [x] Support native-style hover states.
- [ ] Support native-style pressed states.
- [x] Support destructive close-button hover styling.
- [x] Support keyboard focus for each caption button.
- [x] Support high-contrast focus indicators.
- [ ] Support reduced-motion friendly transitions.
- [x] Support hit targets consistent with desktop window controls.
- [x] Support safe placement at the end of a frameless title row.
- [x] Support avoiding draggable regions over caption buttons.
- [x] Support light and dark theme rendering.
- [ ] Support RTL-compatible ordering when the host chooses it.
- [ ] Support disabled states for host-controlled modal situations.
- [ ] Support tooltips for icon-only controls.
- [x] Support screen-reader-friendly button names.
- [x] Support bridge-agnostic operation without Electron imports.
- [x] Support testing with mock callbacks.
- [ ] Support custom class names for host chrome integration.
- [ ] Support compact mode for small title bars.
- [ ] Support platform-specific visual variants when the host requests them.
- [x] Support stable button ordering for muscle memory.
- [ ] Support future caption actions without owning window state.
