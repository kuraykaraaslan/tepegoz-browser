# @tepegoz/notifications CHECKLIST

Prepared from the package README only; implementation status was not inspected.

- [ ] Support an in-memory notification store.
- [ ] Support newest-first notification ordering.
- [ ] Support a bounded notification ring buffer.
- [ ] Support adding notifications from validated input.
- [ ] Support deduplicating notifications by dedupe key.
- [ ] Support dismissing a single notification.
- [ ] Support dismissing all notifications.
- [ ] Support marking one notification as read.
- [ ] Support marking all notifications as read.
- [ ] Support unread count calculation.
- [ ] Support snapshot state for renderer consumption.
- [ ] Support subscriptions for notification state changes.
- [ ] Support unsubscribe functions for listeners.
- [ ] Support reset seams for tests.
- [ ] Support trust-boundary validation for notification drafts.
- [ ] Support default notification channels.
- [ ] Support notification kinds such as info, success, warning, and error.
- [ ] Support notification sources such as agent, website, and system.
- [ ] Support notification actions with typed action targets.
- [ ] Support center-only notifications.
- [ ] Support toast-channel notifications.
- [ ] Support native-channel metadata when the host uses OS notifications.
- [ ] Support host-assigned notification IDs.
- [ ] Support host-assigned timestamps.
- [ ] Support redacted notification payloads.
- [ ] Support per-notification priority or urgency metadata.
- [ ] Support expiration metadata for transient notifications.
- [ ] Support grouped notifications by source or dedupe key.
- [ ] Support schemas built from shared type enums.
- [ ] Support future notification channels through canonical shared types.
