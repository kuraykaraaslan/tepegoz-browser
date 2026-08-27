/**
 * Desktop adapter for `@tepegoz/navigation`: binds the pure trusted-origin allow-list to Electron's
 * `app.isPackaged`. Keeping this thin wrapper lets the IPC sender allow-list and the navigation guard
 * keep importing from `./lib/trusted-origin` unchanged.
 */
import { app } from 'electron';
import { isTrustedAppUrl as isTrusted } from '@tepegoz/navigation';
import { chromeDocumentUrl } from '../chrome-url';
import { REAL_PAGE_HOSTS } from '../internal-pages/real-page-hosts';

/**
 * True ONLY for our own app content (see `@tepegoz/navigation`).
 *
 * `chromeUrl` is what narrows this from "any `file://` document on the machine" to the one document the
 * chrome actually is. Resolved per call rather than cached: `__dirname` is fixed at build time, so this
 * is cheap, and a cached value would be one more thing to invalidate.
 */
export function isTrustedAppUrl(rawUrl: string): boolean {
  return isTrusted(rawUrl, {
    isPackaged: app.isPackaged,
    chromeUrl: chromeDocumentUrl(),
    // Windows paths fold case; Linux paths do not, and folding there would make a differently-cased
    // path — a genuinely different file — compare equal to the chrome.
    caseInsensitivePaths: process.platform === 'win32',
    // The migrated `tepegoz://` real pages (Faz 2/3 of protocol-tepegoz-pages.md) share the chrome's
    // preload + partition and are meant to carry the same IPC trust — the SAME allow-list that decides
    // which hosts protocol.ts will actually serve, so there is one place that answers "which internal
    // pages are real" for both concerns.
    internalPageHosts: [...REAL_PAGE_HOSTS],
  });
}
