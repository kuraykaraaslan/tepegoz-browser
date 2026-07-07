# @tepegoz/human-input CHECKLIST

Prepared from the package README only; implementation status was not inspected.

- [ ] Support curved mouse movement paths instead of straight jumps.
- [ ] Support eased pointer speed profiles.
- [ ] Support realistic movement delta emission.
- [ ] Support click hold-time jitter.
- [ ] Support key hold-time jitter.
- [ ] Support key flight-time jitter between typed keys.
- [ ] Support human-like scroll easing.
- [ ] Support overshoot and spring-back scroll behavior.
- [ ] Support injected CDP transport for all input events.
- [ ] Support pointer move callbacks for visual cursor overlays.
- [ ] Support action callbacks for UI feedback and logging.
- [ ] Support user-interruption checks during long motion.
- [ ] Support aborting simulated input when real user activity appears.
- [ ] Support typing plain text through insert-text paths.
- [ ] Support pressing named keyboard keys.
- [ ] Support mouse click targeting by viewport coordinate.
- [ ] Support scroll targeting by amount and direction.
- [ ] Support deterministic test mode through injectable randomness.
- [ ] Support configurable jitter ranges by action type.
- [ ] Support configurable movement duration and pacing.
- [ ] Support accessibility-friendly reduced-motion configuration.
- [ ] Support viewport-boundary clamping for pointer paths.
- [ ] Support high-DPI coordinate handling.
- [ ] Support multi-step drag gestures.
- [ ] Support double-click and context-click gestures.
- [ ] Support modifier-key combinations.
- [ ] Support text selection gestures.
- [ ] Support testable math helpers without DOM or Electron access.
- [ ] Support safe failures when CDP transport rejects an event.
- [ ] Support future hardware-level input transports through the same adapter.
