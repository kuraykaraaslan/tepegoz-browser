/**
 * `@tepegoz/notifications` — headless notification-center core: the `NotificationStore` model plus the
 * trust-boundary schema/factory. The data model & enums are owned by `@tepegoz/shared-types` (zod-free,
 * so the preload-safe IPC contract can reuse them); this package builds the zod schema from them.
 */
export { default } from './notification-store';
export * from './notification.schema';
export type {
  AppNotification,
  NotificationAction,
  NotificationActionType,
  NotificationChannel,
  NotificationKind,
  NotificationSource,
  NotificationState,
} from '@tepegoz/shared-types/notifications';
