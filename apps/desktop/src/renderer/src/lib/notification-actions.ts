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
  // Hoisted so each case tests one thing. `url` is optional on the type but required by four of the
  // cases, and repeating the `!== undefined && .length > 0` pair in each of them is what pushed this
  // switch past the complexity budget.
  const url = action.url ?? '';
  switch (action.type) {
    case 'open_url':
      if (url.length === 0) return false;
      window.tepegoz.createTab(url);
      return true;
    case 'open_url_background':
      if (url.length === 0) return false;
      window.tepegoz.createTabInBackground(url);
      return true;
    case 'navigate_current':
      if (url.length === 0) return false;
      window.tepegoz.navigateTab(url);
      return true;
    case 'trust_origin': {
      // Trust the source site (its future popups pass), then open the pending popup.
      const origin = item.origin ?? '';
      if (origin.length > 0) window.tepegoz.trustPopupOrigin(origin);
      if (url.length === 0) return false;
      window.tepegoz.createTab(url);
      return true;
    }
    case 'open_settings':
      window.tepegoz.navigateTab(INTERNAL_SETTINGS_URL);
      return true;
    case 'undo_session_restore':
      // Main owns which tabs the restore opened and whether the offer still stands — the renderer only
      // relays the click. Returns true so the toast dismisses itself: the offer is one-shot.
      window.tepegoz.undoSessionRestore();
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
