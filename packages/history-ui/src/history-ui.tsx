import { useEffect, useState } from 'react';

/** The minimal history entry the view renders. Hosts pass their own richer entries (structural). */
export interface HistoryItem {
  url: string;
  title: string;
  /** Visit timestamp (epoch ms). */
  ts: number;
}

/** Localized strings, supplied by the host so the package stays i18n-agnostic. */
export interface HistoryUiLabels {
  title: string;
  search: string;
  clear: string;
  delete: string;
  empty: string;
}

export interface HistoryPageProps {
  labels: HistoryUiLabels;
  /** Fetch history for a (trimmed) query; empty string = full history. Returns newest-first. */
  list: (query: string) => Promise<HistoryItem[]>;
  /** Remove one entry by URL; returns the updated list. */
  remove: (url: string) => Promise<HistoryItem[]>;
  /** Clear all history; returns the (empty) list. */
  clear: () => Promise<HistoryItem[]>;
}

/**
 * `@tepegoz/history-ui` — the browsing-history manager (Chrome-style): a search box + a newest-first
 * list of visited pages, each removable, plus "Clear all". Owns its search/list state; the data
 * source (list/remove/clear) is injected, so the package has no dependency on the Electron bridge.
 * Extracted from `apps/desktop` per docs/package-map.md.
 */
export function HistoryPage({ labels, list, remove, clear }: HistoryPageProps) {
  const [search, setSearch] = useState('');
  const [entries, setEntries] = useState<HistoryItem[]>([]);

  useEffect(() => {
    void list(search.trim()).then(setEntries, () => {
      setEntries([]);
    });
    // `list` is a stable data-source binding; re-fetch only when the query changes.

  }, [search]);

  return (
    <div className="flex h-full flex-col bg-surface-base text-text-primary">
      <div className="shrink-0 border-b border-border px-8 py-4">
        <div className="mx-auto flex max-w-3xl items-center gap-4">
          <h1 className="text-base font-semibold">{labels.title}</h1>
          <input
            type="text"
            value={search}
            placeholder={labels.search}
            aria-label={labels.search}
            spellCheck={false}
            onChange={(e) => {
              setSearch(e.target.value);
            }}
            className="ml-auto h-9 w-72 max-w-full rounded-full border border-border bg-surface-raised px-4 text-sm text-text-primary placeholder:text-text-disabled focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
          />
          <button
            type="button"
            onClick={() => {
              void clear().then(setEntries, () => undefined);
            }}
            className="rounded-md border border-border px-3 py-1.5 text-sm text-text-secondary hover:bg-surface-overlay hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
          >
            {labels.clear}
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
                aria-label={labels.delete}
                title={labels.delete}
                onClick={() => {
                  void remove(entry.url).then(setEntries, () => undefined);
                }}
                className="shrink-0 rounded-md px-2 py-1 text-xs text-text-secondary hover:bg-surface-overlay hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
        {entries.length === 0 && (
          <p className="mx-auto max-w-3xl py-8 text-sm text-text-secondary">{labels.empty}</p>
        )}
      </div>
    </div>
  );
}
