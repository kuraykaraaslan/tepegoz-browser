/**
 * Which URLs may be bookmarked — a SCHEME ALLOW-LIST, shared by the renderer (whether to offer the
 * star) and the main-process IPC guard (defense in depth). This is deliberately broader than
 * @tepegoz/navigation's `isWebUrl` (http/https only, the guard for loading into an untrusted view):
 * a bookmark is just a stored pointer, so trusted internal pages (`tepegoz://…`) and local files
 * (`file://…`) are bookmarkable too. Dangerous schemes that could execute or smuggle content
 * (`javascript:`, `data:`, `blob:`, `chrome:`, `about:`, …) stay rejected.
 *
 * Pure (no Electron, no app imports) so it is unit-testable and importable from both processes.
 */
const BOOKMARKABLE_SCHEME = /^(https?|file|tepegoz):/i;

/** True if `url` is allowed to be bookmarked (http(s), file://, or a tepegoz:// internal page). */
export function isBookmarkable(url: string): boolean {
  return BOOKMARKABLE_SCHEME.test(url.trim());
}
