/**
 * True ONLY for our own app content. Used by the IPC sender allow-list and the navigation guard.
 *
 * This used to answer `true` for **any** `file://` URL. That was the whole check: a scheme shared with
 * every document on the user's disk decided whether a frame may speak to the main process. The caller
 * now passes the chrome's own document URL, so the question is answered by identity rather than by
 * scheme.
 *
 * Query and hash are ignored on purpose — the chrome is loaded as `index.html?surface=onboarding` and
 * friends, and the surface parameter does not change which document it is.
 *
 * Exact host matching via URL parsing — NOT a string prefix — so spoofed hosts like
 * `http://localhost.evil.com` are rejected (a `startsWith('http://localhost')` check would accept them).
 * The Vite dev server is trusted only when the app is not packaged.
 *
 * Pure (no Electron): the host app injects `isPackaged` and `chromeUrl`, so this stays unit-testable and
 * reusable.
 */
export interface TrustedOriginOptions {
  isPackaged: boolean;
  /**
   * The chrome document's own URL (no query). When omitted, any `file://` URL is trusted — the old,
   * scheme-wide behaviour, kept only so a caller that genuinely cannot know the path is not silently
   * locked out. Every caller in this repo passes it.
   */
  chromeUrl?: string;
}

/** Strip query + hash so `index.html?surface=onboarding` matches `index.html`. */
function documentOf(url: URL): string {
  return `${url.protocol}//${url.host}${url.pathname}`;
}

export function isTrustedAppUrl(rawUrl: string, opts: TrustedOriginOptions): boolean {
  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    return false;
  }

  if (u.protocol === 'file:') {
    if (opts.chromeUrl === undefined) return true;
    let chrome: URL;
    try {
      chrome = new URL(opts.chromeUrl);
    } catch {
      return false;
    }
    // Case-insensitive: Windows paths are, and `pathToFileURL` percent-encodes identically on both
    // sides, so this compares the same normalised form the loader produced.
    return documentOf(u).toLowerCase() === documentOf(chrome).toLowerCase();
  }

  if (opts.isPackaged) return false;

  return (
    (u.protocol === 'http:' || u.protocol === 'https:') &&
    (u.hostname === 'localhost' || u.hostname === '127.0.0.1')
  );
}
