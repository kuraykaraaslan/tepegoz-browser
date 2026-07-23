# @tepegoz/human-input CHECKLIST

Status verified against the implementation (2026-07-23); checked items have concrete code backing them.

- [x] Support curved mouse movement paths instead of straight jumps.
- [x] Support eased pointer speed profiles.
- [x] Support realistic movement delta emission.
- [x] Support click hold-time jitter.
- [x] Support key hold-time jitter.
- [x] Support key flight-time jitter between typed keys.
- [x] Support human-like scroll easing.
- [x] Support overshoot and spring-back scroll behavior.
- [x] Support injected CDP transport for all input events.
- [x] Support pointer move callbacks for visual cursor overlays.
- [x] Support action callbacks for UI feedback and logging.
- [x] Support user-interruption checks during long motion.
- [x] Support aborting simulated input when real user activity appears.
- [x] Support typing plain text through insert-text paths.
- [x] Support pressing named keyboard keys.
- [x] Support mouse click targeting by viewport coordinate.
- [x] Support scroll targeting by amount and direction.
- [ ] Support deterministic test mode through injectable randomness.
- [ ] Support configurable jitter ranges by action type.
- [ ] Support configurable movement duration and pacing.
- [ ] Support accessibility-friendly reduced-motion configuration.
- [ ] Support viewport-boundary clamping for pointer paths.
- [ ] Support high-DPI coordinate handling.
- [ ] Support multi-step drag gestures.
- [ ] Support double-click and context-click gestures.
- [x] Support modifier-key combinations.
- [ ] Support text selection gestures.
- [x] Support testable math helpers without DOM or Electron access.
- [ ] Support safe failures when CDP transport rejects an event.
- [ ] Support future hardware-level input transports through the same adapter.
