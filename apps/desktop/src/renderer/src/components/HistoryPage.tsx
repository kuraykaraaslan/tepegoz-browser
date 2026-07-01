import { useEffect, useState } from 'react';
import type { Resources } from '@tepegoz/i18n';
import type { HistoryEntry } from '../../../shared/ipc-contract';

/**
 * Browsing-history manager (tepegoz://history), Chrome-style: a search box + a newest-first list of
 * visited pages, each removable, plus "Clear all". Data comes from the SQLite DB connector via IPC.
 */
interface HistoryPageProps {
  t: Resources;
}

export function HistoryPage({ t }: HistoryPageProps) {
  const h = t.history;
  const [search, setSearch] = useState('');
  const [entries, setEntries] = useState<HistoryEntry[]>([]);

  useEffect(() => {
    const q = search.trim();
    void (q.length === 0 ? window.tepegoz.getHistory() : window.tepegoz.searchHistory(q)).then(
      setEntries,
      () => {
        setEntries([]);
      },
    );
  }, [search]);

  return (
    <div className="flex h-full flex-col bg-surface-base text-text-primary">
      <div className="shrink-0 border-b border-border px-8 py-4">
        <div className="mx-auto flex max-w-3xl items-center gap-4">
          <h1 className="text-base font-semibold">{h.title}</h1>
          <input
            type="text"
            value={search}
            placeholder={h.search}
            aria-label={h.search}
            spellCheck={false}
            onChange={(e) => {
              setSearch(e.target.value);
            }}
            className="ml-auto h-9 w-72 max-w-full rounded-full border border-border bg-surface-raised px-4 text-sm text-text-primary placeholder:text-text-disabled focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
          />
          <button
            type="button"
            onClick={() => {
              void window.tepegoz.clearHistory().then(setEntries, () => undefined);
            }}
            className="rounded-md border border-border px-3 py-1.5 text-sm text-text-secondary hover:bg-surface-overlay hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
          >
            {h.clear}
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
                aria-label={h.delete}
                title={h.delete}
                onClick={() => {
                  void window.tepegoz.deleteHistory(entry.url).then(setEntries, () => undefined);
                }}
                className="shrink-0 rounded-md px-2 py-1 text-xs text-text-secondary hover:bg-surface-overlay hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
        {entries.length === 0 && (
          <p className="mx-auto max-w-3xl py-8 text-sm text-text-secondary">{h.empty}</p>
        )}
      </div>
    </div>
  );
}
