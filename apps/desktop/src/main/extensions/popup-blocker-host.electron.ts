import { createPopupBlockerHost } from '@tepegoz/ext-popup-blocker/host';
import PreferenceStore from '@tepegoz/preferences';
import NotificationHost from '../notifications/notification-host';
import { mainLocale } from '../lib/i18n-main';

/**
 * Main-process wiring for the Popup Blocker (strict) extension's host (ADR-0022). Constructs the
 * extension's Electron-free `createPopupBlockerHost` with concrete `PreferenceStore`/`NotificationHost`
 * adapters — mirrors `capability-supervisor.electron.ts`'s wiring shim.
 *
 * `index.ts` calls {@link popupBlockerHost}`.init()` at startup and registers
 * `.interceptors` with `ActionInterceptorService`; `ipc-content.ts`'s popup-blocker IPC handlers call
 * `.get`/`.update`/`.trustOrigin`/`.getRecentRequests` directly on this same singleton.
 */
const popupBlockerHost = createPopupBlockerHost({
  getPrefs: () => {
    const prefs = PreferenceStore.getAll();
    return { popupBlocker: prefs.popupBlocker, popupBlockerSeeded: prefs.popupBlockerSeeded };
  },
  updatePrefs: (patch) => {
    PreferenceStore.update(patch);
  },
  pushNotification: (draft) => {
    NotificationHost.push(draft);
  },
  locale: () => mainLocale(),
});

export default popupBlockerHost;
