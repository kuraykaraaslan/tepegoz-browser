import { useEffect, useMemo, useRef, useState } from 'react';
import { resolveLocale, type Locale } from '@tepegoz/i18n';
import { I18nProvider } from '@tepegoz/i18n/react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faBookmark, faChevronDown, faChevronRight, faFolder } from '@fortawesome/free-solid-svg-icons';
import type { BookmarkTreeNode } from '@tepegoz/desktop-ipc';
import { applyTheme } from '../lib/theme';

/**
 * Standalone render target for a bar folder's dropdown (loaded with `?surface=bookmark-folder&id=<id>`).
 * A SEPARATE native window floating over the page — a native `WebContentsView` can't occlude another
 * native window, which an in-renderer dropdown couldn't avoid. Self-contained: it fetches the tree, finds
 * the folder, and renders its contents; clicking a bookmark navigates the main window then closes.
 */
const ROW_H = 32;

function findNode(nodes: readonly BookmarkTreeNode[], id: string): BookmarkTreeNode | null {
  for (const n of nodes) {
    if (n.id === id) return n;
    const hit = findNode(n.children, id);
    if (hit !== null) return hit;
  }
  return null;
}

function Favicon({ src }: { src: string | null | undefined }) {
  const [failed, setFailed] = useState(false);
  if (src === null || src === undefined || src.length === 0 || failed) {
    return <FontAwesomeIcon icon={faBookmark} className="h-4 w-4 shrink-0 text-text-secondary" aria-hidden />;
  }
  return <img src={src} alt="" aria-hidden className="h-4 w-4 shrink-0 rounded-sm object-contain" onError={() => setFailed(true)} />;
}

const ROW =
  'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-text-secondary ' +
  'hover:bg-surface-overlay hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus';

/** Recursive folder contents — subfolders expand inline (the window scrolls if it grows tall). */
function FolderContents({ nodes, depth }: { nodes: readonly BookmarkTreeNode[]; depth: number }) {
  return (
    <>
      {nodes.map((n) =>
        n.type === 'folder' ? (
          <FolderBranch key={n.id} node={n} depth={depth} />
        ) : (
          <button
            key={n.id}
            type="button"
            className={ROW}
            style={{ paddingLeft: 8 + depth * 14 }}
            title={n.title.length > 0 ? n.title : (n.url ?? '')}
            onClick={() => {
              if (n.url !== null) window.tepegoz.navigateTab(n.url);
              window.tepegoz.closePopup();
            }}
          >
            <Favicon src={n.favicon} />
            <span className="min-w-0 flex-1 truncate">{n.title.length > 0 ? n.title : n.url}</span>
          </button>
        ),
      )}
    </>
  );
}

function FolderBranch({ node, depth }: { node: BookmarkTreeNode; depth: number }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className={ROW}
        style={{ paddingLeft: 8 + depth * 14 }}
        onClick={() => setOpen((o) => !o)}
      >
        <FontAwesomeIcon icon={open ? faChevronDown : faChevronRight} className="h-2.5 w-2.5 shrink-0 opacity-70" aria-hidden />
        <FontAwesomeIcon icon={faFolder} className="h-4 w-4 shrink-0" aria-hidden />
        <span className="min-w-0 flex-1 truncate">{node.title.length > 0 ? node.title : '—'}</span>
      </button>
      {open && <FolderContents nodes={node.children} depth={depth + 1} />}
    </>
  );
}

export function BookmarkFolderPopup({ folderId }: { folderId: string }) {
  const [locale, setLocale] = useState<Locale>('en');
  const [children, setChildren] = useState<BookmarkTreeNode[]>([]);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = contentRef.current;
    if (el === null) return;
    const report = (): void => window.tepegoz.resizePopup(Math.ceil(el.getBoundingClientRect().height));
    report();
    const observer = new ResizeObserver(report);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const prefs = await window.tepegoz.getPreferences();
        if (cancelled) return;
        applyTheme(prefs.theme, prefs.themeColor);
        setLocale(prefs.locale === 'en' || prefs.locale === 'tr' ? prefs.locale : resolveLocale(navigator.language));
      } catch {
        /* bridge unavailable */
      }
      try {
        const tree = await window.tepegoz.getBookmarkTree();
        if (!cancelled) setChildren(findNode(tree, folderId)?.children ?? []);
      } catch {
        if (!cancelled) setChildren([]);
      }
    })();
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') window.tepegoz.closePopup();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      cancelled = true;
      window.removeEventListener('keydown', onKey);
    };
  }, [folderId]);

  const isEmpty = useMemo(() => children.length === 0, [children]);

  return (
    <I18nProvider locale={locale}>
      <div className="flex h-screen flex-col overflow-hidden bg-surface-base text-text-primary">
        <div className="min-h-0 flex-1 overflow-auto">
          <div ref={contentRef} className="flow-root p-1">
            {isEmpty ? (
              <span className="block px-2 py-1.5 text-sm text-text-tertiary" style={{ minHeight: ROW_H }}>
                —
              </span>
            ) : (
              <FolderContents nodes={children} depth={0} />
            )}
          </div>
        </div>
      </div>
    </I18nProvider>
  );
}
