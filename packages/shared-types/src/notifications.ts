/**
 * Notification identity + data model — the ONE place these unions are spelled out. Deliberately
 * zod-free and exported as its own `@tepegoz/shared-types/notifications` entry so the desktop IPC
 * contract (imported by the SANDBOXED preload, which must stay dependency-free) can consume it at
 * runtime; `enums.ts` builds the zod validators from these same arrays, and `@tepegoz/notifications`
 * builds the object schema from them — so schema/type drift is impossible.
 */

/** Visual severity — maps to the `AlertBanner` variant (icon + colour) in the UI. */
export const NOTIFICATION_KINDS = ['info', 'success', 'warning', 'error'] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

/** Who raised the notification (drives grouping/filtering and default channels). */
export const NOTIFICATION_SOURCES = ['agent', 'download', 'security', 'system', 'site'] as const;
export type NotificationSource = (typeof NOTIFICATION_SOURCES)[number];

/**
 * The delivery surfaces a notification is shown through — the SOURCE chooses which apply:
 *  - `center` — persisted in the in-app notification center (bell panel) + counts toward unread;
 *  - `toast`  — shown as a transient in-app toast;
 *  - `native` — raised as a native OS notification (visible while the app is unfocused).
 */
export const NOTIFICATION_CHANNELS = ['center', 'toast', 'native'] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

/** Per-site permission state for a web capability (e.g. the Web Notification API). */
export const SITE_PERMISSION_STATES = ['allowed', 'denied', 'prompt'] as const;
export type SitePermissionState = (typeof SITE_PERMISSION_STATES)[number];

/**
 * What a notification action does when activated (a bounded, safe set so the host can execute it from
 * the action's type alone — no arbitrary callbacks cross the IPC boundary):
 *  - `open_url` — open `NotificationAction.url` in a new tab;
 *  - `open_settings` — open the app settings page;
 *  - `mark_read` — mark this notification read;
 *  - `dismiss` — dismiss this notification.
 */
export const NOTIFICATION_ACTION_TYPES = ['open_url', 'open_settings', 'mark_read', 'dismiss'] as const;
export type NotificationActionType = (typeof NOTIFICATION_ACTION_TYPES)[number];

/** One actionable button on a notification. Multiple may be attached (see `AppNotification.actions`). */
export interface NotificationAction {
  /** Stable id (unique within the notification). */
  id: string;
  /** Localized button label (the source supplies it already-localized). */
  label: string;
  type: NotificationActionType;
  // `| undefined` mirrors the zod `.optional()` output shape under exactOptionalPropertyTypes (the core
  // schema parses into this type), matching the McpServerPref convention.
  /** Target URL for `open_url` actions. */
  url?: string | undefined;
}

/** A notification as stored/rendered. Never carries secrets (safe to journal/redact upstream). */
export interface AppNotification {
  id: string;
  kind: NotificationKind;
  source: NotificationSource;
  title: string;
  body: string;
  /** Epoch millis when raised. */
  ts: number;
  read: boolean;
  /** Delivery surfaces this notification is shown through (source-chosen; at least one). */
  channels: NotificationChannel[];
  /** Whether the user can dismiss it from the center (defaults true in the store). */
  dismissible?: boolean;
  /** Originating site origin, for `source: 'site'` notifications. */
  origin?: string;
  /** Actionable buttons (0–4). The host executes each from its `type` (see {@link NotificationAction}). */
  actions?: NotificationAction[];
  /** Collapse repeats: a new notification with the same key replaces the prior one. */
  dedupeKey?: string;
}

/** The renderer-facing snapshot pushed on every store mutation. */
export interface NotificationState {
  items: AppNotification[];
  /** Count of center items with `read === false`. */
  unread: number;
}
