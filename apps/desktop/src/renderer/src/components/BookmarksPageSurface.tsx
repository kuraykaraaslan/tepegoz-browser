import { useEffect, useState } from 'react';
import { I18nProvider } from '@tepegoz/i18n/react';
import { BookmarksManager } from '@tepegoz/bookmarks-ui';
import { bookmarkDialogAnchor } from '../app-bookmarks';
import { useSurfaceLocale } from '../app-surface-locale';

/** Desktop host for `tepegoz://bookmarks` loaded as a real page (Faz 3 of
 *  phases/tracks/protocol-tepegoz-pages.md) — mirrors `SettingsPageSurface.tsx`'s pattern. `refreshKey`
 *  is bumped whenever ANY window mutates bookmarks (`onBookmarksChanged`), matching
 *  `app-bookmarks.ts#useBookmarksBar`'s own refetch signal. */
export function BookmarksPageSurface() {
  const locale = useSurfaceLocale();
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    return window.tepegoz.onBookmarksChanged(() => {
      setRefreshKey((k) => k + 1);
    });
  }, []);

  function bumpRefresh(): void {
    setRefreshKey((k) => k + 1);
  }

  return (
    <I18nProvider locale={locale}>
      {/* `fixed`, not `absolute`: this is a standalone document whose shell must BE the viewport.
          An `absolute` box is the containing block for any positioned descendant that escapes an
          inner scroll area (a `sr-only` input, a table caption), and such a descendant then counts
          toward the DOCUMENT's scroll height — which let the whole page scroll and slide its own
          header out of view. A `fixed` box is excluded from that scroll height, so it cannot. */}
      <div className="fixed inset-0 bg-surface-system">
        <BookmarksManager
          getTree={() => window.tepegoz.getBookmarkTree()}
          refreshKey={refreshKey}
          onMove={(id, newParentId, index) => {
            window.tepegoz.moveBookmark(id, newParentId, index).then(bumpRefresh, () => undefined);
          }}
          onNewFolder={(parentId) =>
            window.tepegoz.openPopup('bookmark-add-folder', bookmarkDialogAnchor(), { id: parentId })
          }
          onOpen={(url) => window.tepegoz.navigateTab(url)}
          onContextMenu={(id, type) => window.tepegoz.showBookmarkContextMenu(id, type)}
          onSetTags={(id, tags) => window.tepegoz.setBookmarkTags(id, tags)}
          onExport={() => window.tepegoz.exportBookmarks()}
        />
      </div>
    </I18nProvider>
  );
}
