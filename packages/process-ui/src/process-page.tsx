import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faMicrochip, faRotateRight, faXmark } from '@fortawesome/free-solid-svg-icons';
import { useT } from '@tepegoz/i18n/react';
import type { ProcessRow, ProcessSnapshot } from '@tepegoz/desktop-ipc';
import { processDict, type ProcessStrings } from './i18n';
import {
  DEFAULT_SORT_DIRECTION,
  formatBytes,
  formatCpu,
  sortRows,
  sortRowsByColumn,
  totals,
  type SortKey,
  type SortState,
} from './process-page-helpers';

/** `aria-sort` value for a header, given the active sort state. */
function ariaSortFor(sort: SortState | null, key: SortKey): 'ascending' | 'descending' | 'none' {
  if (sort?.key !== key) return 'none';
  return sort.direction === 'asc' ? 'ascending' : 'descending';
}

/** A clickable, sortable column header — a real `<button>` inside the `<th>`. */
function SortHeader({
  label,
  sort,
  sortKey,
  strings,
  align = 'left',
  onSort,
}: Readonly<{
  label: string;
  sort: SortState | null;
  sortKey: SortKey;
  strings: ProcessStrings['sort'];
  align?: 'left' | 'right';
  onSort: (key: SortKey) => void;
}>) {
  const active = sort !== null && sort.key === sortKey;
  // Only read when `active`, so the active sort is the one in scope.
  const ascending = sort !== null && sort.direction === 'asc';
  return (
    <button
      type="button"
      title={strings.hint}
      onClick={() => onSort(sortKey)}
      className={`flex w-full items-center gap-1 font-medium hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus ${
        align === 'right' ? 'justify-end' : ''
      }`}
    >
      <span>{label}</span>
      <span aria-hidden className="text-[10px] leading-none">
        {active ? (ascending ? '▲' : '▼') : ''}
      </span>
      {active && <span className="sr-only">{ascending ? strings.ascending : strings.descending}</span>}
    </button>
  );
}

export interface ProcessPageProps {
  /** Fetch a fresh snapshot. The page calls this on its own interval — there is no push. */
  poll: () => Promise<ProcessSnapshot>;
  /** End one tab's renderer process (by tab id). Fire-and-forget; the next poll reflects it. */
  end: (tabId: string) => void;
  /** Poll interval in ms. Injectable so tests don't wait. Default 1500. */
  intervalMs?: number;
}

export function ProcessPage({ poll, end, intervalMs = 1500 }: Readonly<ProcessPageProps>) {
  const t = useT(processDict);
  // Raw poll output, untouched — the display order is derived below so a new poll never disturbs the
  // user's chosen sort and incoming rows are never mutated.
  const [rows, setRows] = useState<ProcessRow[] | null>(null);
  const [sort, setSort] = useState<SortState | null>(null);
  const pollRef = useRef(poll);
  pollRef.current = poll;

  const refresh = useCallback(() => {
    void pollRef.current().then(
      (snapshot) => setRows(snapshot.rows),
      () => undefined,
    );
  }, []);

  const onSort = useCallback((key: SortKey) => {
    setSort((prev) =>
      prev?.key === key
        ? { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' }
        : { key, direction: DEFAULT_SORT_DIRECTION[key] },
    );
  }, []);

  // Re-sorted from scratch every render out of the current sort state: no sort picked → the default
  // kind-grouped order; a column picked → a pure, stable sort on that column.
  const orderedRows = useMemo(() => {
    if (rows === null) return null;
    return sort === null ? sortRows(rows) : sortRowsByColumn(rows, sort.key, sort.direction);
  }, [rows, sort]);

  useEffect(() => {
    refresh();
    let timer: ReturnType<typeof setInterval> | null = null;
    const start = (): void => {
      if (timer === null) timer = setInterval(refresh, intervalMs);
    };
    const stop = (): void => {
      if (timer !== null) {
        clearInterval(timer);
        timer = null;
      }
    };
    // Don't poll a hidden tab — the task manager watching itself off-screen is pure waste.
    const onVisibility = (): void => {
      if (document.visibilityState === 'visible') {
        refresh();
        start();
      } else {
        stop();
      }
    };
    if (document.visibilityState === 'visible') start();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [refresh, intervalMs]);

  const sum = totals(rows ?? []);

  return (
    <div className="flex h-full flex-col bg-surface-system text-text-primary">
      <div className="flex shrink-0 items-center gap-3 border-b border-border px-8 py-4">
        <FontAwesomeIcon icon={faMicrochip} className="h-4 w-4 text-text-secondary" aria-hidden />
        <h1 className="text-base font-semibold">{t.title}</h1>
        <button
          type="button"
          aria-label={t.refresh}
          onClick={refresh}
          className="ml-auto flex h-8 w-8 items-center justify-center rounded-md text-text-secondary hover:bg-surface-overlay hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
        >
          <FontAwesomeIcon icon={faRotateRight} className="h-3.5 w-3.5" aria-hidden />
        </button>
      </div>

      <div className="flex-1 overflow-auto px-8 py-4">
        <div className="mx-auto max-w-4xl">
          {orderedRows === null && <p className="py-4 text-sm text-text-secondary">{t.loading}</p>}
          {orderedRows !== null && orderedRows.length === 0 && (
            <p className="py-8 text-sm text-text-secondary">{t.empty}</p>
          )}
          {orderedRows !== null && orderedRows.length > 0 && (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-text-secondary">
                  <th aria-sort={ariaSortFor(sort, 'task')} className="py-2 font-medium">
                    <SortHeader
                      label={t.columns.task}
                      sort={sort}
                      sortKey="task"
                      strings={t.sort}
                      onSort={onSort}
                    />
                  </th>
                  <th
                    aria-sort={ariaSortFor(sort, 'cpu')}
                    className="w-20 py-2 text-right font-medium"
                  >
                    <SortHeader
                      label={t.columns.cpu}
                      sort={sort}
                      sortKey="cpu"
                      strings={t.sort}
                      align="right"
                      onSort={onSort}
                    />
                  </th>
                  <th
                    aria-sort={ariaSortFor(sort, 'memory')}
                    className="w-28 py-2 text-right font-medium"
                  >
                    <SortHeader
                      label={t.columns.memory}
                      sort={sort}
                      sortKey="memory"
                      strings={t.sort}
                      align="right"
                      onSort={onSort}
                    />
                  </th>
                  <th
                    aria-sort={ariaSortFor(sort, 'pid')}
                    className="w-24 py-2 text-right font-medium"
                  >
                    <SortHeader
                      label={t.columns.pid}
                      sort={sort}
                      sortKey="pid"
                      strings={t.sort}
                      align="right"
                      onSort={onSort}
                    />
                  </th>
                  <th className="w-10 py-2" />
                </tr>
              </thead>
              <tbody>
                {orderedRows.map((r) => (
                  <tr
                    key={r.tabId ?? `pid-${String(r.pid)}`}
                    className="border-b border-border/50 last:border-0"
                  >
                    <td className="py-2 pr-2">
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="shrink-0 rounded-full border border-border px-1.5 py-0.5 text-[10px] text-text-secondary">
                          {t.kind[r.kind]}
                        </span>
                        <span className="truncate">{r.label}</span>
                        {r.discarded === true && (
                          <span className="shrink-0 rounded-full bg-surface-raised px-1.5 py-0.5 text-[10px] text-text-secondary">
                            {t.discarded}
                          </span>
                        )}
                      </span>
                    </td>
                    <td className="py-2 text-right tabular-nums text-text-secondary">
                      {formatCpu(r.cpuPercent)}
                    </td>
                    <td className="py-2 text-right tabular-nums text-text-secondary">
                      {formatBytes(r.memoryBytes)}
                    </td>
                    <td className="py-2 text-right tabular-nums text-text-secondary">
                      {r.pid > 0 ? r.pid : t.noProcess}
                    </td>
                    <td className="py-2 text-right">
                      {r.kind === 'tab' && r.tabId !== undefined && r.discarded !== true && (
                        <button
                          type="button"
                          aria-label={t.endProcess}
                          title={t.endProcess}
                          onClick={() => end(r.tabId as string)}
                          className="flex h-7 w-7 items-center justify-center rounded-md text-text-secondary hover:bg-surface-overlay hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                        >
                          <FontAwesomeIcon icon={faXmark} className="h-3.5 w-3.5" aria-hidden />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="text-xs text-text-secondary">
                  <td className="py-2 font-medium">{t.total}</td>
                  <td className="py-2 text-right tabular-nums">{formatCpu(sum.cpuPercent)}</td>
                  <td className="py-2 text-right tabular-nums">{formatBytes(sum.memoryBytes)}</td>
                  <td className="py-2" />
                  <td className="py-2" />
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
