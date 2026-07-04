import { useEffect, useRef, useState } from 'react';
import { pick, resolveLocale, type Locale } from '@tepegoz/i18n';
import type { BookmarkTreeNode } from '@tepegoz/desktop-ipc';
import { browserDict } from '../../../i18n';
import { applyTheme } from '../lib/theme';

/**
 * Standalone render target for the bookmark rename / add-folder dialog (loaded with
 * `?surface=bookmark-rename|bookmark-add-folder&id=<id>`). A SEPARATE native window so the page stays
 * visible behind it (an in-renderer modal would sit behind the page's native view). For rename, `id` is
 * the node; for add-folder, `id` is the parent folder. On submit it mutates over IPC — main broadcasts
 * `bookmarks:changed`, so the main window's bar/manager refetch — then closes.
 */
type DialogMode = 'rename' | 'add-folder';

function findNode(nodes: readonly BookmarkTreeNode[], id: string): BookmarkTreeNode | null {
  for (const n of nodes) {
    if (n.id === id) return n;
    const hit = findNode(n.children, id);
    if (hit !== null) return hit;
  }
  return null;
}

export function BookmarkDialogPopup({ mode, id }: { mode: DialogMode; id: string }) {
  const [locale, setLocale] = useState<Locale>('en');
  const [value, setValue] = useState('');
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
      if (mode === 'rename') {
        try {
          const tree = await window.tepegoz.getBookmarkTree();
          if (!cancelled) setValue(findNode(tree, id)?.title ?? '');
        } catch {
          /* keep empty */
        }
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
  }, [mode, id]);

  const t = pick(browserDict, locale);

  const submit = async (): Promise<void> => {
    const v = value.trim();
    if (v.length > 0) {
      try {
        if (mode === 'rename') await window.tepegoz.renameBookmark(id, v);
        else await window.tepegoz.createBookmarkFolder(id, v);
      } catch {
        /* the boundary logged it; close regardless */
      }
    }
    window.tepegoz.closePopup();
  };

  return (
    <div className="flex h-screen flex-col bg-surface-base text-text-primary">
      <div ref={contentRef} className="flow-root">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
          className="flex flex-col gap-3 p-4"
        >
          <span className="text-sm font-medium text-text-primary">
            {mode === 'rename' ? t.renameTitle : t.newFolder}
          </span>
          <input
            autoFocus
            value={value}
            placeholder={t.folderNamePlaceholder}
            onChange={(e) => setValue(e.target.value)}
            className="rounded-md border border-border bg-surface-raised px-3 py-2 text-sm text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => window.tepegoz.closePopup()}
              className="rounded-md px-3 py-1.5 text-sm text-text-secondary hover:bg-surface-overlay"
            >
              {t.cancel}
            </button>
            <button
              type="submit"
              className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-fg hover:bg-primary-hover"
            >
              {mode === 'rename' ? t.save : t.add}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
