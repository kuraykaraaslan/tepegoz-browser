import PreferenceStore from '@tepegoz/preferences';
import {
  IpcChannels,
  type NotificationPermissionResponse,
  type SitePermissionState,
  type WebPermissionCapability,
} from '@tepegoz/desktop-ipc';
import TabManager from '../tabs';

const PROMPT_TIMEOUT_MS = 60_000;

let seq = 0;
const pending = new Map<
  string,
  {
    origin: string;
    capability: WebPermissionCapability;
    resolve: (allow: boolean) => void;
  }
>();

function storedState(
  origin: string,
  capability: WebPermissionCapability,
): SitePermissionState | undefined {
  return PreferenceStore.getAll().sitePermissions[origin]?.[capability];
}

function capabilityEnabled(capability: WebPermissionCapability): boolean {
  return capability !== 'notifications' || PreferenceStore.getAll().notificationsEnabled;
}

function persist(
  origin: string,
  capability: WebPermissionCapability,
  state: SitePermissionState,
): void {
  const prefs = PreferenceStore.getAll();
  PreferenceStore.update({
    sitePermissions: {
      ...prefs.sitePermissions,
      [origin]: { ...prefs.sitePermissions[origin], [capability]: state },
    },
  });
}

export default class WebPermissionBroker {
  static request(capability: WebPermissionCapability, origin: string): Promise<boolean> {
    if (!capabilityEnabled(capability)) return Promise.resolve(false);
    const decided = storedState(origin, capability);
    if (decided === 'allowed') return Promise.resolve(true);
    if (decided === 'denied') return Promise.resolve(false);
    // The requesting page is (virtually always) the active tab of the focused window — prompt there.
    const target = TabManager.focusedWindow();
    if (target === null || target.isDestroyed()) return Promise.resolve(false);

    seq += 1;
    const requestId = `perm-${String(seq)}`;
    target.webContents.send(IpcChannels.notificationPermissionRequest, {
      requestId,
      origin,
      capability,
    });
    return new Promise<boolean>((resolve) => {
      pending.set(requestId, { origin, capability, resolve });
      setTimeout(() => {
        const entry = pending.get(requestId);
        if (entry !== undefined) {
          pending.delete(requestId);
          entry.resolve(false);
        }
      }, PROMPT_TIMEOUT_MS);
    });
  }

  /**
   * Ask for several capabilities, all of which must be granted. Sequential and short-circuiting: a
   * user who declines the camera is not then asked for the microphone for a call that is already not
   * happening.
   */
  static async requestAll(
    capabilities: readonly WebPermissionCapability[],
    origin: string,
  ): Promise<boolean> {
    for (const capability of capabilities) {
      if (!(await WebPermissionBroker.request(capability, origin))) return false;
    }
    return capabilities.length > 0;
  }

  static isAllowed(capability: WebPermissionCapability, origin: string): boolean {
    return capabilityEnabled(capability) && storedState(origin, capability) === 'allowed';
  }

  static respond(res: NotificationPermissionResponse): void {
    const entry = pending.get(res.requestId);
    if (entry === undefined) return;
    pending.delete(res.requestId);
    if (res.remember) persist(entry.origin, entry.capability, res.allow ? 'allowed' : 'denied');
    entry.resolve(res.allow);
  }
}
