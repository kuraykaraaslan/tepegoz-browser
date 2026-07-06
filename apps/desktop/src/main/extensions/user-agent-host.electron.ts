import { session } from 'electron';
import { Logger } from '@tepegoz/libs';
import {
  createUserAgentHost,
  USER_AGENT_EXTENSION_ID,
} from '@tepegoz/ext-user-agent/host';
import { isExtensionEnabled } from '@tepegoz/desktop-ipc';
import PreferenceStore from '@tepegoz/preferences';
import TabManager, { BROWSING_PARTITION } from '../tabs';

/**
 * Main-process wiring for the User-Agent switcher extension's host (ADR-0024). Constructs the
 * Electron-free `createUserAgentHost` with concrete adapters over the isolated browsing session
 * ({@link BROWSING_PARTITION}), `PreferenceStore`, and `TabManager` — mirrors
 * `popup-blocker-host.electron.ts`. The captured default UA is read lazily on first `defaultUserAgent`
 * call (the session exists by the time `init` runs, after the app is ready).
 *
 * `index.ts` calls `.init()` at startup; `ipc-content.ts`'s user-agent handlers call `.get`/`.set`.
 */
let capturedDefaultUa: string | null = null;

function browsingSession() {
  return session.fromPartition(BROWSING_PARTITION);
}

const userAgentHost = createUserAgentHost({
  getPersisted: () => PreferenceStore.getAll().userAgent,
  setPersisted: (ua) => {
    PreferenceStore.update({ userAgent: ua });
  },
  defaultUserAgent: () => {
    capturedDefaultUa ??= browsingSession().getUserAgent();
    return capturedDefaultUa;
  },
  applyToSession: (ua) => {
    browsingSession().setUserAgent(ua);
  },
  applyToTabs: (ua) => {
    TabManager.applyUserAgent(ua);
    Logger.info('User-Agent override applied', { isDefault: ua === capturedDefaultUa });
  },
  isEnabled: () => isExtensionEnabled(PreferenceStore.getAll().extensions, USER_AGENT_EXTENSION_ID),
});

export default userAgentHost;
