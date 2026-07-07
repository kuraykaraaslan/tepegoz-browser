/**
 * Desktop adapter for `@tepegoz/navigation`: re-exports the pure URL helpers and binds
 * `internalPageUrl` to THIS app's set of internal (`tepegoz://…`) pages. Keeping this thin wrapper
 * lets every call site keep importing from `./lib/navigation-url` unchanged.
 */
import { internalPageUrl as resolveInternalPage } from '@tepegoz/navigation';
import {
  INTERNAL_BOOKMARKS_URL,
  INTERNAL_EXTENSIONS_URL,
  INTERNAL_DOWNLOADS_URL,
  INTERNAL_HISTORY_URL,
  INTERNAL_NEWTAB_URL,
  INTERNAL_SETTINGS_URL,
  INTERNAL_TASKS_URL,
  INTERNAL_UPLOADS_URL,
} from '@tepegoz/desktop-ipc';
import { extensionPageUrls } from '../../shared/extensions';

export { isWebUrl, toNavigationUrl } from '@tepegoz/navigation';

/** The canonical internal-page URL if `input` addresses one, else null. The extension page URLs are
 *  computed at CALL time — the built-in catalog is loaded at startup AFTER this module is imported, so
 *  capturing them at module scope would freeze an empty list and break `tepegoz://<ext-id>` routing. */
export function internalPageUrl(input: string): string | null {
  // Built-in app pages + every extension that declares a `page` surface (tepegoz://<extension-id>).
  const internalUrls: readonly string[] = [
    INTERNAL_NEWTAB_URL,
    INTERNAL_SETTINGS_URL,
    INTERNAL_EXTENSIONS_URL,
    INTERNAL_HISTORY_URL,
    INTERNAL_DOWNLOADS_URL,
    INTERNAL_UPLOADS_URL,
    INTERNAL_TASKS_URL,
    INTERNAL_BOOKMARKS_URL,
    ...extensionPageUrls(),
  ];
  return resolveInternalPage(input, internalUrls);
}
