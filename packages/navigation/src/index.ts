/**
 * `@tepegoz/navigation` — pure URL logic for the browser: omnibox → safe http(s) URL (scheme
 * allow-list), internal-page (`tepegoz://…`) detection, and the trusted-origin allow-list. No
 * Electron and no app imports — the desktop app injects `isPackaged` and its internal-page set via
 * thin adapters. Extracted from `apps/desktop` per docs/package-map.md.
 */
export { isWebUrl, internalPageUrl, toNavigationUrl } from './navigation-url';
export { isTrustedAppUrl } from './trusted-origin';
