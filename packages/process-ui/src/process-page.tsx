import { useCallback, useEffect, useRef, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faMicrochip, faRotateRight, faXmark } from '@fortawesome/free-solid-svg-icons';
import { useT } from '@tepegoz/i18n/react';
import type { ProcessRow, ProcessSnapshot } from '@tepegoz/desktop-ipc';
import { processDict } from './i18n';
import { formatBytes, formatCpu, sortRows, totals } from './process-page-helpers';

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
  const [rows, setRows] = useState<ProcessRow[] | null>(null);
  const pollRef = useRef(poll);
  pollRef.current = poll;

  const refresh = useCallback(() => {
    void pollRef.current().then(
      (snapshot) => setRows(sortRows(snapshot.rows)),
      () => undefined,
    );
  }, []);

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
          {rows === null && <p className="py-4 text-sm text-text-secondary">{t.loading}</p>}
          {rows !== null && rows.length === 0 && (
            <p className="py-8 text-sm text-text-secondary">{t.empty}</p>
          )}
          {rows !== null && rows.length > 0 && (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-text-secondary">
                  <th className="py-2 font-medium">{t.columns.task}</th>
                  <th className="w-20 py-2 text-right font-medium">{t.columns.cpu}</th>
                  <th className="w-28 py-2 text-right font-medium">{t.columns.memory}</th>
                  <th className="w-24 py-2 text-right font-medium">{t.columns.pid}</th>
                  <th className="w-10 py-2" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
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
