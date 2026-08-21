import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * Where the app chrome comes from — the ONE definition, used both to load it and to recognise it.
 *
 * Recognising it matters more than loading it. `isTrustedAppUrl` gates the IPC sender allow-list and the
 * navigation guard, and it used to answer "is this our own UI?" with `rawUrl.startsWith('file://')` —
 * a scheme shared with every document on the user's disk. It could not do better, because nothing told
 * it which file the chrome actually is. This module is that answer, so the check can compare against one
 * exact document instead of a whole scheme.
 *
 * Serving the chrome from a custom `app://` scheme instead was tried and reverted: it works (verified in
 * a packaged build, with CDP showing the chrome live at `app://chrome/index.html` and the
 * `grantFileProtocolExtraPrivileges` fuse closed), but Playwright's Electron support does not surface
 * windows on non-standard schemes, so `electronApplication.firstWindow()` never resolves and the entire
 * e2e suite goes blind. Trading a working e2e gate — itself a Phase 0/1a DoD item — for one fuse is a bad
 * trade. The fuse stays open, named and explained in `electron-builder.yml`; the trust check gets tight
 * either way, which is where the actual exposure was.
 */

/** The chrome document on disk. `__dirname` is `out/main` in both packaged and unpackaged builds. */
export function chromeFilePath(): string {
  return join(__dirname, '../renderer/index.html');
}

/** The chrome document as a URL, with no query — what a sender frame's URL matches against. */
export function chromeDocumentUrl(): string {
  return pathToFileURL(chromeFilePath()).toString();
}
