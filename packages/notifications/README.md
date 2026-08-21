# @tepegoz/notifications

Headless notification-center core: an in-memory `NotificationStore` model plus the trust-boundary
schema/factory for incoming notifications. The data model and enums (`AppNotification`,
`NotificationKind`, `NotificationChannel`, …) are owned by `@tepegoz/shared-types` (zod-free, so the
preload-safe IPC contract can reuse them); this package builds the zod schema from those canonical
arrays and adds the mutable store on top. Framework-agnostic and Electron-free — the main-process
`NotificationHost` owns the singleton, drives IPC, and decides toast/native delivery from a
notification's `channels`.

## Exports

- **`NotificationStore`** (default export) — static, newest-first ring buffer (cap 200): `add(item)`
  (replaces any prior item sharing the new item's `dedupeKey`), `dismiss(id)`, `dismissAll()`,
  `markRead(id)`, `markAllRead()`, `list()` (defensive copy), `unreadCount()`, `state()` (the
  renderer-facing `{ items, unread }` snapshot), `subscribe(listener)` (returns an unsubscribe fn; does
  not fire on subscribe), `reset()` (test seam — clears items and listeners).
- **`NotificationInputSchema`** (+ `NotificationInput`/`NotificationDraft` types) — the trust-boundary
  zod schema for a notification arriving from a source (agent event, website via consent, system).
  `NotificationDraft` is the pre-parse caller shape (`channels` optional); `NotificationInput` is the
  post-parse shape (`channels` always present, defaulted to `['center']`).
- **`toNotification(input, id, now)`** — pure factory assembling a stored `AppNotification` from
  validated input plus a host-assigned id and clock.
- **`NotificationActionSchema`** — schema for one actionable button (bounded type + optional target
  URL) on a notification.
- Re-exports of **`AppNotification`**, **`NotificationAction`**, **`NotificationActionType`**,
  **`NotificationChannel`**, **`NotificationKind`**, **`NotificationSource`**, **`NotificationState`**
  from `@tepegoz/shared-types/notifications`.

## Scripts

`pnpm typecheck` · `pnpm lint` · `pnpm test`
