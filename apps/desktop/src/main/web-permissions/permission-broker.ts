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

/**
 * Which capabilities each origin has actually ASKED for this run.
 *
 * The Site Info bubble lists a permission row only for a capability the site requested or the user
 * already decided — enumerating all six on every site is noise, and Chrome does not do it either.
 * Deliberately in memory: "has this site ever asked" is not a user decision and is not worth
 * persisting; a fresh run starts from the stored decisions alone.
 */
const requestedByOrigin = new Map<string, Set<WebPermissionCapability>>();

/** The capabilities `origin` has requested since launch (see {@link requestedByOrigin}). */
export function requestedCapabilities(origin: string): readonly WebPermissionCapability[] {
  return [...(requestedByOrigin.get(origin) ?? [])];
}

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
    // Recorded before every short-circuit below: the site asked, whatever the answer turns out to be,
    // and the bubble's row is about the asking — a capability answered from a stored grant, or refused
    // because notifications are off globally, is exactly the one the user may want to revisit.
    const asked = requestedByOrigin.get(origin) ?? new Set<WebPermissionCapability>();
    asked.add(capability);
    requestedByOrigin.set(origin, asked);
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
