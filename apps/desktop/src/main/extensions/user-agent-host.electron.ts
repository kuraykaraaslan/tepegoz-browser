import { Logger } from '@tepegoz/libs';
import { createUserAgentHost, USER_AGENT_EXTENSION_ID } from '@tepegoz/ext-user-agent/host';
import { isExtensionEnabled } from '@tepegoz/desktop-ipc';
import PreferenceStore from '@tepegoz/preferences';
import TabManager from '../tabs';
import BrowsingSessions from '../network/browsing-sessions.electron';

/**
 * Main-process wiring for the User-Agent switcher extension's host (ADR-0024). Constructs the
 * Electron-free `createUserAgentHost` with concrete adapters over the browsing sessions,
 * `PreferenceStore`, and `TabManager` — mirrors `popup-blocker-host.electron.ts`. The captured default
 * UA is read lazily on first `defaultUserAgent` call (the session exists by the time `init` runs, after
 * the app is ready).
 *
 * **Every** browsing session, not just the base one. A UA override that stopped at the Direct partition
 * would leave a VPN/Tor-bound tab announcing the real platform UA while every other tab announced the
 * override — a fingerprint mismatch that makes the tunneled tab the *distinctive* one, inside the
 * feature meant to make it less identifiable. So the applied UA is remembered and re-applied by an
 * attacher to every session created later (`BrowsingSessions`).
 *
 * `index.ts` calls `.init()` at startup; `ipc-content.ts`'s user-agent handlers call `.get`/`.set`.
 */
let capturedDefaultUa: string | null = null;
/** The UA last applied on the wire — replayed onto every browsing session created after the fact. */
let appliedUa: string | null = null;

BrowsingSessions.register('user-agent', (ses) => {
  if (appliedUa !== null) ses.setUserAgent(appliedUa);
});

const userAgentHost = createUserAgentHost({
  getPersisted: () => PreferenceStore.getAll().userAgent,
  setPersisted: (ua) => {
    PreferenceStore.update({ userAgent: ua });
  },
  defaultUserAgent: () => {
    capturedDefaultUa ??= BrowsingSessions.direct().getUserAgent();
    return capturedDefaultUa;
  },
  applyToSession: (ua) => {
    appliedUa = ua;
    for (const { session: ses } of BrowsingSessions.all()) ses.setUserAgent(ua);
  },
  applyToTabs: (ua) => {
    TabManager.applyUserAgent(ua);
    Logger.info('User-Agent override applied', { isDefault: ua === capturedDefaultUa });
  },
  isEnabled: () => isExtensionEnabled(PreferenceStore.getAll().extensions, USER_AGENT_EXTENSION_ID),
});

export default userAgentHost;
