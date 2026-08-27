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
  /**
   * Whether the host filesystem treats paths case-insensitively (Windows: yes; Linux: no; macOS: it
   * depends on how the volume was formatted).
   *
   * This is a security parameter, not a convenience. Folding case on a case-SENSITIVE filesystem makes
   * `/app/Index.html` and `/app/index.html` compare equal while being two different files — so a
   * document that is not the chrome would be trusted by the IPC sender allow-list. Defaults to `false`,
   * which is the strict reading; the desktop adapter passes `process.platform === 'win32'`.
   */
  caseInsensitivePaths?: boolean;
  /**
   * Hostnames of `tepegoz://` internal pages that are ALSO real, first-party trusted content (e.g.
   * `'settings'`, `'history'`) — the same renderer bundle + preload as the chrome, served as an actual
   * page instead of a chrome-embedded overlay (see `internal-pages/protocol.ts`). Unlike the localhost
   * dev-server escape hatch, this is not gated on `isPackaged`: `tepegoz:` is a scheme only this app can
   * register, so an allow-listed host is trusted in every build. Defaults to none (no caller currently
   * omits it, but a caller that cannot enumerate its internal pages should not be silently trusted).
   */
  internalPageHosts?: readonly string[];
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
    const fold = (value: string): string =>
      opts.caseInsensitivePaths === true ? value.toLowerCase() : value;
    // `pathToFileURL` percent-encodes identically on both sides, so this compares the same normalised
    // form the loader produced.
    return fold(documentOf(u)) === fold(documentOf(chrome));
  }

  if (u.protocol === 'tepegoz:') {
    return (opts.internalPageHosts ?? []).includes(u.hostname);
  }

  if (opts.isPackaged) return false;

  return (
    (u.protocol === 'http:' || u.protocol === 'https:') &&
    (u.hostname === 'localhost' || u.hostname === '127.0.0.1')
  );
}
