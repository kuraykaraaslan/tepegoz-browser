import { useCallback, useEffect, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faBan,
  faBoxArchive,
  faCircleExclamation,
  faDownload,
  faFolderOpen,
  faPause,
  faPlay,
  faTrash,
  faUpRightFromSquare,
} from '@fortawesome/free-solid-svg-icons';
import { useT } from '@tepegoz/i18n/react';
import {
  commandNeedsApproval,
  type DownloadCommandInput,
  type DownloadRecord,
  type DownloadsState,
} from '@tepegoz/downloads';
import { downloadsDict } from './i18n';

export interface DownloadsPageProps {
  list: () => Promise<DownloadRecord[]>;
  command: (input: DownloadCommandInput) => Promise<void>;
  subscribe: (callback: (state: DownloadsState) => void) => () => void;
}

function formatBytes(value: number, units: { b: string; kb: string; mb: string; gb: string }): string {
  if (value < 1024) return `${value} ${units.b}`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} ${units.kb}`;
  if (value < 1024 * 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} ${units.mb}`;
  return `${(value / (1024 * 1024 * 1024)).toFixed(1)} ${units.gb}`;
}

function percentOf(item: DownloadRecord): number | null {
  if (item.totalBytes === null || item.totalBytes === 0) return null;
  return Math.max(0, Math.min(100, Math.round((item.receivedBytes / item.totalBytes) * 100)));
}

export function DownloadsPage({ list, command, subscribe }: Readonly<DownloadsPageProps>) {
  const t = useT(downloadsDict);
  const [items, setItems] = useState<DownloadRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void list().then(
      (records) => {
        if (cancelled) return;
        setItems(records);
        setLoading(false);
      },
      () => {
        if (cancelled) return;
        setItems([]);
        setLoading(false);
      },
    );
    const unsubscribe = subscribe((state) => {
      setItems(state.items);
      setLoading(false);
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [list, subscribe]);

  const run = useCallback(
    (input: DownloadCommandInput) => {
      void command(input).catch(() => undefined);
    },
    [command],
  );

  return (
    <div className="flex h-full flex-col bg-surface-system text-text-primary">
      <div className="shrink-0 border-b border-border px-8 py-4">
        <div className="mx-auto flex max-w-4xl items-center gap-3">
          <FontAwesomeIcon icon={faDownload} className="h-4 w-4 text-text-secondary" aria-hidden />
          <h1 className="text-base font-semibold">{t.title}</h1>
        </div>
      </div>

      <div className="flex-1 overflow-auto px-8 py-4">
        {loading && <p className="mx-auto max-w-4xl py-4 text-sm text-text-secondary">{t.loading}</p>}
        {!loading && items.length === 0 && (
          <p className="mx-auto max-w-4xl py-8 text-sm text-text-secondary">{t.empty}</p>
        )}
        <ul className="mx-auto max-w-4xl divide-y divide-border">
          {items.map((item) => (
            <DownloadRow key={item.id} item={item} onCommand={run} />
          ))}
        </ul>
      </div>
    </div>
  );
}

function DownloadRow({
  item,
  onCommand,
}: {
  item: DownloadRecord;
  onCommand: (input: DownloadCommandInput) => void;
}) {
  const t = useT(downloadsDict);
  const percent = percentOf(item);
  const details =
    item.totalBytes === null
      ? `${formatBytes(item.receivedBytes, t.bytes)} · ${t.progressUnknown}`
      : `${formatBytes(item.receivedBytes, t.bytes)} / ${formatBytes(item.totalBytes, t.bytes)}`;
  const riskyRelease = commandNeedsApproval(item, 'release');

  return (
    <li className="flex gap-3 py-4">
      <div className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-surface-raised text-text-secondary">
        <FontAwesomeIcon
          icon={item.status === 'blocked' ? faBan : item.risk === 'archive' ? faBoxArchive : faDownload}
          className="h-4 w-4"
          aria-hidden
        />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <p className="truncate text-sm font-medium text-text-primary">{item.filename}</p>
          <span className="shrink-0 rounded-full border border-border px-2 py-0.5 text-xs text-text-secondary">
            {t.status[item.status]}
          </span>
          <span className="shrink-0 rounded-full border border-border px-2 py-0.5 text-xs text-text-secondary">
            {t.trust[item.trustVerdict]}
          </span>
          <span className="shrink-0 rounded-full border border-border px-2 py-0.5 text-xs text-text-secondary">
            {t.risk[item.risk]}
          </span>
        </div>
        <p className="mt-1 truncate text-xs text-text-secondary">{item.provenance.sourceOrigin ?? item.url}</p>
        <div className="mt-2 flex items-center gap-3">
          <div className="h-1.5 min-w-0 flex-1 rounded-full bg-surface-raised">
            <div
              className="h-1.5 rounded-full bg-primary"
              style={{ width: `${percent ?? 0}%` }}
            />
          </div>
          <span className="w-40 shrink-0 text-right text-xs text-text-secondary">{details}</span>
        </div>
        {riskyRelease && item.status === 'quarantined' && (
          <p className="mt-2 flex items-center gap-1 text-xs text-text-secondary">
            <FontAwesomeIcon icon={faCircleExclamation} className="h-3 w-3" aria-hidden />
            {t.riskyRelease}
          </p>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          {item.status === 'in_progress' && (
            <ActionButton label={t.action.pause} icon={faPause} onClick={() => onCommand({ id: item.id, action: 'pause' })} />
          )}
          {item.status === 'paused' && (
            <ActionButton label={t.action.resume} icon={faPlay} onClick={() => onCommand({ id: item.id, action: 'resume' })} />
          )}
          {(item.status === 'requested' || item.status === 'in_progress' || item.status === 'paused') && (
            <ActionButton label={t.action.cancel} icon={faBan} onClick={() => onCommand({ id: item.id, action: 'cancel' })} />
          )}
          {item.status === 'quarantined' && (
            <ActionButton label={t.action.release} icon={faUpRightFromSquare} onClick={() => onCommand({ id: item.id, action: 'release' })} />
          )}
          {item.status === 'completed' && (
            <ActionButton label={t.action.open} icon={faUpRightFromSquare} onClick={() => onCommand({ id: item.id, action: 'open' })} />
          )}
          {(item.status === 'completed' || item.status === 'quarantined') && (
            <ActionButton label={t.action.reveal} icon={faFolderOpen} onClick={() => onCommand({ id: item.id, action: 'reveal' })} />
          )}
          {['completed', 'blocked', 'canceled', 'failed'].includes(item.status) && (
            <ActionButton label={t.action.clear} icon={faTrash} onClick={() => onCommand({ id: item.id, action: 'clear' })} />
          )}
        </div>
      </div>
    </li>
  );
}

function ActionButton({
  label,
  icon,
  onClick,
}: {
  label: string;
  icon: typeof faPause;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-xs text-text-secondary hover:bg-surface-overlay hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
    >
      <FontAwesomeIcon icon={icon} className="h-3 w-3" aria-hidden />
      {label}
    </button>
  );
}
