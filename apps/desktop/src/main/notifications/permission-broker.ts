import { BrowserWindow } from 'electron';
import PreferenceStore from '@tepegoz/preferences';
import {
  IpcChannels,
  type NotificationPermissionResponse,
  type SitePermissionState,
} from '@tepegoz/desktop-ipc';

/**
 * Per-site consent broker for the Web Notification API. `security.ts` routes a page's `notifications`
 * permission request here; we honor a stored grant/denial, and otherwise prompt the user (HITL) via the
 * chrome renderer, persisting the answer when they choose "remember". Fail-safe: no window, master
 * switch off, or no response within the timeout → denied.
 */
const PROMPT_TIMEOUT_MS = 60_000;

let seq = 0;
let mainWindow: BrowserWindow | null = null;
const pending = new Map<string, { origin: string; resolve: (allow: boolean) => void }>();

function storedState(origin: string): SitePermissionState | undefined {
  return PreferenceStore.getAll().sitePermissions[origin]?.notifications;
}

function persist(origin: string, state: SitePermissionState): void {
  const prefs = PreferenceStore.getAll();
  PreferenceStore.update({
    sitePermissions: {
      ...prefs.sitePermissions,
      [origin]: { ...prefs.sitePermissions[origin], notifications: state },
    },
  });
}

export default class NotificationPermissionBroker {
  /** Record the chrome window that hosts the consent modal. */
  static attach(win: BrowserWindow): void {
    mainWindow = win;
  }

  /** Decide notification permission for `origin`: stored grant/denial wins; else prompt the user. */
  static request(origin: string): Promise<boolean> {
    if (!PreferenceStore.getAll().notificationsEnabled) return Promise.resolve(false);
    const decided = storedState(origin);
    if (decided === 'allowed') return Promise.resolve(true);
    if (decided === 'denied') return Promise.resolve(false);
    if (mainWindow === null || mainWindow.isDestroyed()) return Promise.resolve(false);

    seq += 1;
    const requestId = `perm-${String(seq)}`;
    mainWindow.webContents.send(IpcChannels.notificationPermissionRequest, { requestId, origin });
    return new Promise<boolean>((resolve) => {
      pending.set(requestId, { origin, resolve });
      setTimeout(() => {
        const entry = pending.get(requestId);
        if (entry !== undefined) {
          pending.delete(requestId);
          entry.resolve(false); // fail-safe deny on no response
        }
      }, PROMPT_TIMEOUT_MS);
    });
  }

  /** Whether `origin` currently has notifications allowed (drives the sync permission-check handler). */
  static isAllowed(origin: string): boolean {
    return PreferenceStore.getAll().notificationsEnabled && storedState(origin) === 'allowed';
  }

  /** Resolve a pending prompt with the user's answer; persist the choice when `remember`. */
  static respond(res: NotificationPermissionResponse): void {
    const entry = pending.get(res.requestId);
    if (entry === undefined) return;
    pending.delete(res.requestId);
    if (res.remember) persist(entry.origin, res.allow ? 'allowed' : 'denied');
    entry.resolve(res.allow);
  }
}
