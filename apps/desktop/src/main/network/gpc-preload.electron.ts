import { join } from 'node:path';
import type { Session } from 'electron';
import { Logger } from '@tepegoz/libs';
import PreferenceStore from '@tepegoz/preferences';
import BrowsingSessions from './browsing-sessions.electron';

/**
 * `navigator.globalPrivacyControl` for top-level pages (ADR-0051): register the input-less
 * `preload/page-gpc.js` on every browsing session while the setting is on, unregister it when it is off.
 *
 * Registering and unregistering IS the enforcement. The preload cannot ask what the setting is — that would
 * be an IPC channel from an untrusted page to main — so main decides by whether the file is attached. A
 * change takes effect on each tab's next navigation, which the setting's description says.
 */
const registered = new WeakMap<Session, string>();

export function gpcPreloadPath(): string {
  return join(__dirname, '../preload/page-gpc.js');
}

/** Make `ses` match `enabled`: attach the preload once, or detach it. Idempotent. */
export function syncGpcPreload(
  ses: Session,
  enabled: boolean,
  filePath: string = gpcPreloadPath(),
): void {
  const id = registered.get(ses);
  if (enabled && id === undefined) {
    registered.set(ses, ses.registerPreloadScript({ type: 'frame', filePath }));
  } else if (!enabled && id !== undefined) {
    ses.unregisterPreloadScript(id);
    registered.delete(ses);
  }
}

const enabled = (): boolean => PreferenceStore.getAll().globalPrivacyControl !== false;

/** Attach to every browsing session, now and as new ones (tunnel partitions) appear. Not critical: a
 *  session that misses it still sends the header, so it must never be refused over this. */
export function registerGpcPreload(): void {
  BrowsingSessions.register('gpc-preload', (ses) => {
    try {
      syncGpcPreload(ses, enabled());
    } catch (err) {
      Logger.warn('GPC page preload could not be attached to a session', { err: String(err) });
    }
  });
}

/** The setting changed: bring every live browsing session in line. */
export function reconcileGpcPreload(): void {
  const on = enabled();
  for (const { session } of BrowsingSessions.all()) {
    try {
      syncGpcPreload(session, on);
    } catch (err) {
      Logger.warn('GPC page preload could not be updated on a session', { err: String(err) });
    }
  }
}
