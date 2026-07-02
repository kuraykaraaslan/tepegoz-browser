import {
  INTERNAL_SETTINGS_URL,
  type AppNotification,
  type NotificationAction,
} from '@tepegoz/desktop-ipc';

/**
 * Execute a notification action via the trusted bridge, dispatching on its `type` (the action carries no
 * callback — only safe, bounded data). Returns true when it opened or navigated a surface, so the caller
 * (center popup / toast) can dismiss itself afterwards.
 */
export function runNotificationAction(item: AppNotification, action: NotificationAction): boolean {
  switch (action.type) {
    case 'open_url':
      if (action.url !== undefined && action.url.length > 0) {
        window.tepegoz.createTab(action.url);
        return true;
      }
      return false;
    case 'open_settings':
      window.tepegoz.navigateTab(INTERNAL_SETTINGS_URL);
      return true;
    case 'mark_read':
      window.tepegoz.markNotificationRead(item.id);
      return false;
    case 'dismiss':
      window.tepegoz.dismissNotification(item.id);
      return false;
    default:
      return false;
  }
}
