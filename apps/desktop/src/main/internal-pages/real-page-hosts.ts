/**
 * Split out of `protocol.ts` so it has NO imports of its own: `protocol.ts` needs `../window`
 * (`APP_PARTITION`), and `lib/trusted-origin.ts` needs THIS set (an allow-listed `tepegoz://` host is
 * trusted IPC-wise) while `window.ts` itself imports `lib/trusted-origin.ts` for its navigation guard —
 * so `lib/trusted-origin.ts` importing straight from `protocol.ts` would close a
 * `window.ts` → `trusted-origin.ts` → `protocol.ts` → `window.ts` cycle. A leaf with nothing to import
 * cannot be part of one.
 *
 * One source of truth for "which internal-page hostnames get a real page" either way: `protocol.ts`
 * uses it to decide what to serve, `lib/trusted-origin.ts` uses the SAME set to decide which `tepegoz://`
 * senders may call privileged IPC — a host can't get one without the other.
 */
export const REAL_PAGE_HOSTS = new Set([
  'settings',
  'extensions',
  'history',
  'downloads',
  'uploads',
  'bookmarks',
  'process',
]);
