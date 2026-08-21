/**
 * Desktop adapter for `@tepegoz/navigation`: binds the pure trusted-origin allow-list to Electron's
 * `app.isPackaged`. Keeping this thin wrapper lets the IPC sender allow-list and the navigation guard
 * keep importing from `./lib/trusted-origin` unchanged.
 */
import { app } from 'electron';
import { isTrustedAppUrl as isTrusted } from '@tepegoz/navigation';
import { chromeDocumentUrl } from '../chrome-url';

/**
 * True ONLY for our own app content (see `@tepegoz/navigation`).
 *
 * `chromeUrl` is what narrows this from "any `file://` document on the machine" to the one document the
 * chrome actually is. Resolved per call rather than cached: `__dirname` is fixed at build time, so this
 * is cheap, and a cached value would be one more thing to invalidate.
 */
export function isTrustedAppUrl(rawUrl: string): boolean {
  return isTrusted(rawUrl, { isPackaged: app.isPackaged, chromeUrl: chromeDocumentUrl() });
}
