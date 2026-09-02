'use client';
import { useMemo, useState, type ReactNode } from 'react';
import { cn } from '../../libs/utils/cn';

export type TableColumn<T> = {
  key: keyof T | string;
  header: string;
  render?: (row: T) => ReactNode;
  align?: 'left' | 'center' | 'right';
  sortable?: boolean;
  thClass?: string;
  tdClass?: string;
};

export type DataTableProps<T extends Record<string, unknown>> = {
  columns: TableColumn<T>[];
  rows: T[];
  caption?: string;
  searchable?: boolean;
  searchPlaceholder?: string;
  pageSize?: number;
  pageSizeOptions?: number[];
  emptyMessage?: string;
  className?: string;
};

type SortState = {
  key: string;
  dir: 'asc' | 'desc';
} | null;

export function DataTable<T extends Record<string, unknown>>({
  columns,
  rows,
  caption,
  searchable = true,
  searchPlaceholder = 'Search...',
  pageSize: defaultPageSize = 10,
  pageSizeOptions = [5, 10, 25, 50],
  emptyMessage = 'No results found.',
  className,
}: DataTableProps<T>) {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(defaultPageSize);
  const [sort, setSort] = useState<SortState>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const next =
      q.length === 0
        ? rows
        : rows.filter((row) =>
            columns.some((col) =>
              String(row[col.key as keyof T] ?? '')
                .toLowerCase()
                .includes(q),
            ),
          );

    if (sort === null) return next;
    return [...next].sort((a, b) => {
      const left = String(a[sort.key as keyof T] ?? '');
      const right = String(b[sort.key as keyof T] ?? '');
      const result = left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' });
      return sort.dir === 'asc' ? result : -result;
    });
  }, [columns, rows, search, sort]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const paginated = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);
  const start = filtered.length === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const end = Math.min(safePage * pageSize, filtered.length);

  function toggleSort(key: string): void {
    setSort((current) => {
      if (current?.key !== key) return { key, dir: 'asc' };
      if (current.dir === 'asc') return { key, dir: 'desc' };
      return null;
    });
  }

  return (
    <div className={cn('space-y-3', className)}>
      {searchable && (
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="search"
            value={search}
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="h-9 min-w-40 flex-1 rounded-md border border-border bg-surface-base px-3 text-sm text-text-primary placeholder:text-text-disabled focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
          />
          <select
            value={pageSize}
            onChange={(e) => {
              setPageSize(Number(e.target.value));
              setPage(1);
            }}
            className="h-9 rounded-md border border-border bg-surface-base px-2 text-sm text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
          >
            {pageSizeOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* `relative` is load-bearing, not decoration: the `sr-only` caption below is POSITIONED
          (Tailwind's sr-only is `position:absolute`), so without a positioned ancestor here its
          containing block becomes whatever the host page's outermost positioned box is — escaping this
          scroll container entirely and adding its offset to the DOCUMENT's scroll height. On a short
          window that made every `tepegoz://` page carrying a table document-scrollable, so a wheel
          scroll slid the whole shell — sidebar title and search box included — up out of view. */}
      <div className="relative w-full overflow-x-auto rounded-lg border border-border">
        <table className="w-full table-fixed text-sm">
          {caption && <caption className="sr-only">{caption}</caption>}
          <thead className="border-b border-border bg-surface-sunken">
            <tr>
              {columns.map((col) => {
                const key = String(col.key);
                const sorted = sort?.key === key ? sort.dir : null;
                return (
                  <th
                    key={key}
                    scope="col"
                    className={cn(
                      'px-4 py-3 text-xs font-semibold uppercase tracking-wider text-text-secondary',
                      col.align === 'center' && 'text-center',
                      col.align === 'right' && 'text-right',
                      !col.align && 'text-left',
                      col.thClass,
                    )}
                  >
                    {col.sortable ? (
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                        onClick={() => toggleSort(key)}
                      >
                        {col.header}
                        <span aria-hidden="true">
                          {sorted === null ? '' : sorted === 'asc' ? '↑' : '↓'}
                        </span>
                      </button>
                    ) : (
                      col.header
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-border bg-surface-base">
            {paginated.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-8 text-center text-text-secondary">
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              paginated.map((row, i) => (
                <tr key={i} className="transition-colors hover:bg-surface-overlay">
                  {columns.map((col) => (
                    <td
                      key={String(col.key)}
                      className={cn(
                        'px-4 py-3 text-text-primary',
                        col.align === 'center' && 'text-center',
                        col.align === 'right' && 'text-right',
                        col.tdClass,
                      )}
                    >
                      {col.render ? col.render(row) : String(row[col.key as keyof T] ?? '')}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="text-xs text-text-secondary">
          {filtered.length === 0 ? 'No results' : `Showing ${start}-${end} of ${filtered.length}`}
        </p>
        {totalPages > 1 && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={safePage <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="rounded-md border border-border px-2 py-1 text-xs text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
            >
              Prev
            </button>
            <span className="text-xs text-text-secondary">
              {safePage} / {totalPages}
            </span>
            <button
              type="button"
              disabled={safePage >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="rounded-md border border-border px-2 py-1 text-xs text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
            >
              Next
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
