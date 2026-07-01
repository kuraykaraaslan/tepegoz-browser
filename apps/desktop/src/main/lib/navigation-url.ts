/**
 * Desktop adapter for `@tepegoz/navigation`: re-exports the pure URL helpers and binds
 * `internalPageUrl` to THIS app's set of internal (`tepegoz://…`) pages. Keeping this thin wrapper
 * lets every call site keep importing from `./lib/navigation-url` unchanged.
 */
import { internalPageUrl as resolveInternalPage } from '@tepegoz/navigation';
import {
  INTERNAL_EXTENSIONS_URL,
  INTERNAL_HISTORY_URL,
  INTERNAL_SETTINGS_URL,
} from '@tepegoz/desktop-ipc';
import { EXTENSION_PAGE_URLS } from '../../shared/extensions';

export { isWebUrl, toNavigationUrl } from '@tepegoz/navigation';

// Built-in app pages + every extension that declares a `page` surface (tepegoz://<extension-id>).
const INTERNAL_URLS: readonly string[] = [
  INTERNAL_SETTINGS_URL,
  INTERNAL_EXTENSIONS_URL,
  INTERNAL_HISTORY_URL,
  ...EXTENSION_PAGE_URLS,
];

/** The canonical internal-page URL if `input` addresses one, else null. */
export function internalPageUrl(input: string): string | null {
  return resolveInternalPage(input, INTERNAL_URLS);
}
