import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react';
import { BOOKMARK_ROOT_BAR, isBookmarkable } from '@tepegoz/bookmarks';
import {
  INTERNAL_BOOKMARKS_URL,
  type BookmarkMenuAction,
  type BookmarkTreeNode,
  type ContentBounds,
  type TabsState,
} from '@tepegoz/desktop-ipc';

/** Centered-top anchor for a bookmark rename / add-folder dialog popup. `openPopup` right-aligns the
 *  popup to the anchor's right edge, so a full-dialog-width anchor centers the (same-width) dialog. */
export function bookmarkDialogAnchor(): ContentBounds {
  const width = 320;
  return { x: Math.round(window.innerWidth / 2 - width / 2), y: 72, width, height: 0 };
}

export interface BookmarksBarResult {
  activeBookmarked: boolean;
  barNodes: BookmarkTreeNode[];
  canBookmark: boolean;
  /** Flat `{ url, title }` list feeding omnibox bookmark suggestions (see `./app-omnibox-history`). */
  bookmarksRef: MutableRefObject<{ url: string; title: string }[]>;
  /** Large-folder "open all" confirmation, shown by `App.tsx`'s own Modal. */
  openAllUrls: string[] | null;
  setOpenAllUrls: (urls: string[] | null) => void;
  onToggleBookmark: () => Promise<void>;
  onBookmarkMove: (id: string, newParentId: string, index: number) => void;
  findBarNode: (id: string) => BookmarkTreeNode | null;
}

/**
 * The bookmarks bar/manager/star state + mutation handlers: bookmark bar drag-drop, the folder tree,
 * the active-page star, and the native context-menu action dispatch (open/rename/delete/move/…). Split
 * out of `App.tsx` (ADR-0010 250-line cap).
 */
export function useBookmarksBar(
  tabsRef: MutableRefObject<TabsState>,
  currentUrl: string,
): BookmarksBarResult {
  const bookmarksRef = useRef<{ url: string; title: string }[]>([]);
  const [activeBookmarked, setActiveBookmarked] = useState(false);
  const [barNodes, setBarNodes] = useState<BookmarkTreeNode[]>([]);
  const [openAllUrls, setOpenAllUrls] = useState<string[] | null>(null);
  const canBookmark = isBookmarkable(currentUrl);

  const refreshBookmarks = useCallback(async (): Promise<void> => {
    let tree: BookmarkTreeNode[] = [];
    let flat: Awaited<ReturnType<typeof window.tepegoz.listBookmarks>> = [];
    try {
      [tree, flat] = await Promise.all([
        window.tepegoz.getBookmarkTree(),
        window.tepegoz.listBookmarks(),
      ]);
    } catch {
      tree = [];
      flat = [];
    }
    bookmarksRef.current = flat.map((b) => ({ url: b.url, title: b.title }));
    setBarNodes(tree.find((r) => r.id === BOOKMARK_ROOT_BAR)?.children ?? []);
  }, []);

  useEffect(() => {
    void refreshBookmarks();
  }, [refreshBookmarks]);

  // Reflect whether the active page is bookmarked (drives the star's filled/outline state).
  useEffect(() => {
    if (!canBookmark) {
      setActiveBookmarked(false);
      return;
    }
    let cancelled = false;
    void window.tepegoz.isBookmarked(currentUrl).then(
      (b) => {
        if (!cancelled) setActiveBookmarked(b);
      },
      () => {
        if (!cancelled) setActiveBookmarked(false);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [currentUrl, canBookmark]);

  const onToggleBookmark = useCallback(async (): Promise<void> => {
    const tab = tabsRef.current.tabs.find((tb) => tb.id === tabsRef.current.activeId);
    const url = tab?.url ?? '';
    if (!isBookmarkable(url)) return;
    try {
      const nowBookmarked = await window.tepegoz.toggleBookmark(
        url,
        tab?.title ?? url,
        tab?.faviconUrl ?? null,
      );
      setActiveBookmarked(nowBookmarked);
      await refreshBookmarks();
    } catch (err) {
      console.error('Bookmark toggle failed', err); // star state stays as-is (nothing was persisted)
    }
  }, [refreshBookmarks, tabsRef]);

  // Bookmark bar drag-drop → move; native right-click menu → these renderer-driven actions. Rename and
  // add-folder open a small dialog; the rest run immediately, then refetch so the bar reflects the change.
  const onBookmarkMove = useCallback(
    (id: string, newParentId: string, index: number): void => {
      void (async () => {
        try {
          await window.tepegoz.moveBookmark(id, newParentId, index);
          await refreshBookmarks();
        } catch (err) {
          console.error('Bookmark move failed', err);
        }
      })();
    },
    [refreshBookmarks],
  );

  const findBarNode = useCallback(
    (id: string): BookmarkTreeNode | null => {
      const walk = (nodes: readonly BookmarkTreeNode[]): BookmarkTreeNode | null => {
        for (const n of nodes) {
          if (n.id === id) return n;
          const hit = walk(n.children);
          if (hit !== null) return hit;
        }
        return null;
      };
      return walk(barNodes);
    },
    [barNodes],
  );

  const onBookmarkMenuAction = useCallback(
    async (a: BookmarkMenuAction): Promise<void> => {
      const node = findBarNode(a.id);
      if (a.action === 'open') {
        if (node?.url != null) window.tepegoz.navigateTab(node.url);
      } else if (a.action === 'open-new-tab') {
        if (node?.url != null) window.tepegoz.createTabInBackground(node.url);
      } else if (a.action === 'open-all') {
        const urls: string[] = [];
        const collect = (n: BookmarkTreeNode): void => {
          if (n.type === 'bookmark' && n.url != null) urls.push(n.url);
          n.children.forEach(collect);
        };
        if (node !== null) collect(node);
        if (urls.length > 15) setOpenAllUrls(urls);
        else urls.forEach((u) => window.tepegoz.createTabInBackground(u));
      } else if (a.action === 'delete') {
        try {
          await window.tepegoz.removeBookmark(a.id); // the bookmarks:changed broadcast triggers the refetch
        } catch (err) {
          console.error('Bookmark delete failed', err);
        }
      } else if (a.action === 'open-manager') {
        window.tepegoz.navigateTab(INTERNAL_BOOKMARKS_URL);
      } else if (a.action === 'move-to-bar') {
        try {
          await window.tepegoz.moveBookmark(a.id, BOOKMARK_ROOT_BAR, 100000); // to the bar root's end
        } catch (err) {
          console.error('Move to bar failed', err);
        }
      } else if (a.action === 'rename') {
        window.tepegoz.openPopup('bookmark-rename', bookmarkDialogAnchor(), { id: a.id });
      } else {
        // add-folder: on a folder → subfolder inside it; on a bookmark → a sibling folder on the bar.
        const parentId = a.type === 'folder' ? a.id : BOOKMARK_ROOT_BAR;
        window.tepegoz.openPopup('bookmark-add-folder', bookmarkDialogAnchor(), { id: parentId });
      }
    },
    [findBarNode],
  );

  useEffect(() => {
    return window.tepegoz.onBookmarkMenuAction((a) => {
      void onBookmarkMenuAction(a);
    });
  }, [onBookmarkMenuAction]);

  // The tree changed (possibly from a popup window: folder dropdown, rename/add-folder dialog) → refetch.
  useEffect(() => {
    return window.tepegoz.onBookmarksChanged(() => {
      void refreshBookmarks();
    });
  }, [refreshBookmarks]);

  return {
    activeBookmarked,
    barNodes,
    canBookmark,
    bookmarksRef,
    openAllUrls,
    setOpenAllUrls,
    onToggleBookmark,
    onBookmarkMove,
    findBarNode,
  };
}
