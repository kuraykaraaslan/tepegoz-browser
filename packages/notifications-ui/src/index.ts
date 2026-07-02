/**
 * `@tepegoz/notifications-ui` — presentational notification surfaces (center, toast, permission prompt),
 * mirroring `@tepegoz/browser-menu`: it owns its i18n dictionary and injects all actions as callbacks so
 * it stays bridge-agnostic. The data model & enums are owned by `@tepegoz/shared-types`.
 */
export { NotificationCenter, type NotificationCenterProps } from './notification-center';
export { ToastStack, type ToastStackProps } from './notification-toast';
export {
  NotificationPermissionPrompt,
  type NotificationPermissionPromptProps,
} from './permission-prompt';
export { KIND_VISUALS } from './kind-visuals';
