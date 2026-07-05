import { useCallback, useEffect, useRef, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faXmark } from '@fortawesome/free-solid-svg-icons';
import { useT } from '@tepegoz/i18n/react';
import { historyDict } from './i18n';

const PAGE_SIZE = 50;

/** The minimal history entry the view renders. Hosts pass their own richer entries (structural). */
export interface HistoryItem {
  url: string;
  title: string;
  /** Visit timestamp (epoch ms). */
  ts: number;
}

export interface HistoryPageProps {
  /** Fetch PAGE_SIZE items at `offset` for the given query (empty = all history). */
  list: (query: string, offset: number) => Promise<HistoryItem[]>;
  /** Remove one entry by URL; UI updates optimistically. */
  remove: (url: string) => Promise<void>;
  /** Clear all history. */
  clear: () => Promise<void>;
}

/**
 * `@tepegoz/history-ui` — the browsing-history manager (Chrome-style): a search box + a newest-first
 * list of visited pages, each removable, plus "Clear all". Lazy-loads 50 items at a time via an
 * IntersectionObserver sentinel. Owns its search/list state and its own dictionary (`useT(historyDict)`);
 * the data source (list/remove/clear) is injected, so the package has no dependency on the Electron
 * bridge. Extracted from `apps/desktop` per docs/package-map.md.
 */
export function HistoryPage({ list, remove, clear }: Readonly<HistoryPageProps>) {
  const t = useT(historyDict);
  const [search, setSearch] = useState('');
  const [entries, setEntries] = useState<HistoryItem[]>([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);
  // Ref guard prevents concurrent fetches triggered by fast IntersectionObserver callbacks.
  const loadingRef = useRef(false);

  // Reset and load first page whenever the query or list callback changes.
  useEffect(() => {
    let cancelled = false;
    loadingRef.current = true;
    setLoading(true);
    void list(search.trim(), 0).then(
      (page) => {
        if (cancelled) return;
        loadingRef.current = false;
        setEntries(page);
        setOffset(page.length);
        setHasMore(page.length === PAGE_SIZE);
        setLoading(false);
      },
      () => {
        if (cancelled) return;
        loadingRef.current = false;
        setEntries([]);
        setOffset(0);
        setHasMore(false);
        setLoading(false);
      },
    );
    return () => {
      cancelled = true;
    };
    // `list` is in the deps for correctness — hosts must pass a stable (useCallback) binding.
  }, [search, list]);

  const loadMore = useCallback(() => {
    if (loadingRef.current || !hasMore) return;
    loadingRef.current = true;
    setLoading(true);
    void list(search.trim(), offset).then(
      (page) => {
        loadingRef.current = false;
        setEntries([...entries, ...page]);
        setOffset(offset + page.length);
        setHasMore(page.length === PAGE_SIZE);
        setLoading(false);
      },
      () => {
        loadingRef.current = false;
        setLoading(false);
      },
    );
  }, [entries, hasMore, list, search, offset]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) loadMore();
      },
      { rootMargin: '100px' },
    );
    observer.observe(el);
    return () => {
      observer.disconnect();
    };
  }, [loadMore]);

  return (
    <div className="flex h-full flex-col bg-surface-system text-text-primary">
      <div className="shrink-0 border-b border-border px-8 py-4">
        <div className="mx-auto flex max-w-3xl items-center gap-4">
          <h1 className="text-base font-semibold">{t.title}</h1>
          {/* Programmatic label (UI-03); visually the field stays placeholder-labeled, Chrome-style. */}
          <label htmlFor="history-search" className="sr-only">
            {t.search}
          </label>
          <input
            id="history-search"
            type="text"
            value={search}
            placeholder={t.search}
            spellCheck={false}
            onChange={(e) => {
              setSearch(e.target.value);
            }}
            className="ml-auto h-9 w-72 max-w-full rounded-full border border-border bg-surface-raised px-4 text-sm text-text-primary placeholder:text-text-disabled focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
          />
          <button
            type="button"
            onClick={() => {
              void clear().then(
                () => {
                  setEntries([]);
                  setOffset(0);
                  setHasMore(false);
                },
                () => undefined,
              );
            }}
            className="rounded-md border border-border px-3 py-1.5 text-sm text-text-secondary hover:bg-surface-overlay hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
          >
            {t.clear}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto px-8 py-4">
        <ul className="mx-auto max-w-3xl divide-y divide-border">
          {entries.map((entry) => (
            <li key={entry.url} className="flex items-center gap-3 py-2">
              <span className="w-36 shrink-0 text-xs text-text-secondary">
                {new Date(entry.ts).toLocaleString()}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-text-primary">{entry.title}</p>
                <p className="truncate text-xs text-text-secondary">{entry.url}</p>
              </div>
              <button
                type="button"
                aria-label={t.delete}
                title={t.delete}
                onClick={() => {
                  const { url } = entry;
                  setEntries(entries.filter((e) => e.url !== url));
                  void remove(url);
                }}
                className="shrink-0 rounded-md px-2 py-1 text-xs text-text-secondary hover:bg-surface-overlay hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
              >
                <FontAwesomeIcon icon={faXmark} className="h-3 w-3" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
        {hasMore && <div ref={sentinelRef} className="h-1" />}
        {loading && (
          <p className="mx-auto max-w-3xl py-4 text-xs text-text-secondary">{t.loading}</p>
        )}
        {!loading && entries.length === 0 && (
          <p className="mx-auto max-w-3xl py-8 text-sm text-text-secondary">{t.empty}</p>
        )}
      </div>
    </div>
  );
}
