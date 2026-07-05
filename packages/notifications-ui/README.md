# @tepegoz/notifications-ui

Presentational leaf: the notification surfaces of the browser — the notification center panel, a
bottom-right toast stack, and a Web Notification permission-consent prompt. Mirrors
`@tepegoz/browser-menu`: it owns its own i18n dictionary (`useT(notificationsUiDict)`) and injects
every action as a callback so it stays bridge-agnostic. The data model (`AppNotification`,
`NotificationAction`) is owned by `@tepegoz/shared-types`, not by this package.

## Exports
- **`NotificationCenter`** — the notification list panel: per-row dismiss/mark-read, header bulk
  actions (mark-all-read, clear-all), unread emphasis, and Up/Down/Home/End keyboard navigation.
- **`ToastStack`** — a bottom-right stack of transient, auto-dismissing toasts (`AlertBanner`-styled).
- **`NotificationPermissionPrompt`** — the consent-prompt body for a site's Web Notification
  permission request; meant to be rendered inside `@tepegoz/ui`'s `Modal` by the host.
- **`KIND_VISUALS`** — the icon/container styling per notification `kind`, shared by all three
  surfaces.

## Usage
```tsx
<NotificationCenter
  items={notifications}
  onDismiss={(id) => dismiss(id)}
  onDismissAll={() => dismissAll()}
  onMarkRead={(id) => markRead(id)}
  onMarkAllRead={() => markAllRead()}
  formatTime={(ts) => formatRelativeTime(ts)}
/>

<ToastStack toasts={toasts} onDismiss={(id) => dismiss(id)} />

<Modal open={hasPendingRequest}>
  <NotificationPermissionPrompt origin={origin} onDecision={(allow, remember) => decide(allow, remember)} />
</Modal>
```

## Scripts
`pnpm typecheck` · `pnpm lint` · `pnpm test`
