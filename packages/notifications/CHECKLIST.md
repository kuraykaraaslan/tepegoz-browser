# @tepegoz/notifications CHECKLIST

Status verified against the implementation (2026-07-23); checked items have concrete code backing them.

- [x] Support an in-memory notification store.
- [x] Support newest-first notification ordering.
- [x] Support a bounded notification ring buffer.
- [x] Support adding notifications from validated input.
- [x] Support deduplicating notifications by dedupe key.
- [x] Support dismissing a single notification.
- [x] Support dismissing all notifications.
- [x] Support marking one notification as read.
- [x] Support marking all notifications as read.
- [x] Support unread count calculation.
- [x] Support snapshot state for renderer consumption.
- [x] Support subscriptions for notification state changes.
- [x] Support unsubscribe functions for listeners.
- [x] Support reset seams for tests.
- [x] Support trust-boundary validation for notification drafts.
- [x] Support default notification channels.
- [x] Support notification kinds such as info, success, warning, and error.
- [x] Support notification sources such as agent, website, and system.
- [x] Support notification actions with typed action targets.
- [x] Support center-only notifications.
- [x] Support toast-channel notifications.
- [x] Support native-channel metadata when the host uses OS notifications.
- [x] Support host-assigned notification IDs.
- [x] Support host-assigned timestamps.
- [ ] Support redacted notification payloads.
- [ ] Support per-notification priority or urgency metadata.
- [ ] Support expiration metadata for transient notifications.
- [ ] Support grouped notifications by source or dedupe key.
- [x] Support schemas built from shared type enums.
- [x] Support future notification channels through canonical shared types.
