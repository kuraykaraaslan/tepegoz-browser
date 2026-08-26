import { app } from 'electron';
import { Logger } from '@tepegoz/libs';
import type { DefaultBrowserStatus } from '@tepegoz/desktop-ipc';

/**
 * OS default-browser registration (Phase 2b, narrow scope). Two protocols, because a browser that only
 * claimed `https` would silently lose every plain-`http` link to whatever handled it before.
 *
 * User-initiated only — this never runs on startup. Registering unprompted would rewrite the user's OS
 * default without them asking, which is the kind of surprise a browser install should not spring; the
 * Settings row below is the one place this is called from.
 */
const PROTOCOLS = ['http', 'https'] as const;

/** Read the CURRENT OS state — never assumed, since the user can change it in the OS's own Settings at
 *  any time outside this app. */
export function getDefaultBrowserStatus(): DefaultBrowserStatus {
  try {
    return { isDefault: PROTOCOLS.every((protocol) => app.isDefaultProtocolClient(protocol)) };
  } catch (err) {
    Logger.warn('Failed to read default-browser status', { err: String(err) });
    return { isDefault: false };
  }
}

/**
 * Ask the OS to make Tepegöz the default for http/https. On Windows 10+ this only OFFERS the change —
 * the OS's own Settings/App picker still decides — so the return value is a fresh read of reality, not
 * an assumption that the request succeeded.
 */
export function setAsDefaultBrowser(): DefaultBrowserStatus {
  // Unpackaged (dev) launches run through `electron.exe`, which needs the app directory as an argument
  // to relaunch correctly — the same reason `launch-at-login.ts` passes it. A packaged build's exe needs
  // no extra argument at all.
  const args = app.isPackaged ? [] : [app.getAppPath()];
  for (const protocol of PROTOCOLS) {
    try {
      app.setAsDefaultProtocolClient(protocol, process.execPath, args);
    } catch (err) {
      Logger.warn('Failed to register as default browser', { protocol, err: String(err) });
    }
  }
  return getDefaultBrowserStatus();
}
