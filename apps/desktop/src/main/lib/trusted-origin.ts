/**
 * Desktop adapter for `@tepegoz/navigation`: binds the pure trusted-origin allow-list to Electron's
 * `app.isPackaged`. Keeping this thin wrapper lets the IPC sender allow-list and the navigation guard
 * keep importing from `./lib/trusted-origin` unchanged.
 */
import { app } from 'electron';
import { isTrustedAppUrl as isTrusted } from '@tepegoz/navigation';

/** True ONLY for our own app content (see `@tepegoz/navigation`). */
export function isTrustedAppUrl(rawUrl: string): boolean {
  return isTrusted(rawUrl, { isPackaged: app.isPackaged });
}
