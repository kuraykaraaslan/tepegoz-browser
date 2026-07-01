/**
 * True ONLY for our own app content. Used by the IPC sender allow-list and the navigation guard.
 *
 * Uses exact host matching via URL parsing — NOT a string prefix — so spoofed hosts like
 * `http://localhost.evil.com` are rejected (a `startsWith('http://localhost')` check would accept
 * them). In production only `file://` is trusted; the localhost dev server is trusted only when the
 * app is not packaged.
 *
 * Pure (no Electron): the host app injects `isPackaged` (Electron's `app.isPackaged`) so this stays
 * unit-testable and reusable.
 */
export function isTrustedAppUrl(rawUrl: string, opts: { isPackaged: boolean }): boolean {
  if (rawUrl.startsWith('file://')) return true;
  if (opts.isPackaged) return false;
  try {
    const u = new URL(rawUrl);
    return (
      (u.protocol === 'http:' || u.protocol === 'https:') &&
      (u.hostname === 'localhost' || u.hostname === '127.0.0.1')
    );
  } catch {
    return false;
  }
}
