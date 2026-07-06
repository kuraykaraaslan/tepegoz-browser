import { useCallback, useEffect, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faBan, faCircleExclamation, faFileArrowUp, faTrash } from '@fortawesome/free-solid-svg-icons';
import { useT } from '@tepegoz/i18n/react';
import type { UploadCommandInput, UploadRecord, UploadsState } from '@tepegoz/uploads';
import { isTerminalUploadStatus } from '@tepegoz/uploads';
import { uploadsDict } from './i18n';

export interface UploadsPageProps {
  list: () => Promise<UploadRecord[]>;
  command: (input: UploadCommandInput) => Promise<void>;
  subscribe: (callback: (state: UploadsState) => void) => () => void;
}

function formatBytes(value: number, units: { b: string; kb: string; mb: string; gb: string }): string {
  if (value < 1024) return `${value} ${units.b}`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} ${units.kb}`;
  if (value < 1024 * 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} ${units.mb}`;
  return `${(value / (1024 * 1024 * 1024)).toFixed(1)} ${units.gb}`;
}

export function UploadsPage({ list, command, subscribe }: Readonly<UploadsPageProps>) {
  const t = useT(uploadsDict);
  const [items, setItems] = useState<UploadRecord[]>([]);
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
    (input: UploadCommandInput) => {
      void command(input).catch(() => undefined);
    },
    [command],
  );

  return (
    <div className="flex h-full flex-col bg-surface-system text-text-primary">
      <div className="shrink-0 border-b border-border px-8 py-4">
        <div className="mx-auto flex max-w-4xl items-center gap-3">
          <FontAwesomeIcon icon={faFileArrowUp} className="h-4 w-4 text-text-secondary" aria-hidden />
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
            <UploadRow key={item.id} item={item} onCommand={run} />
          ))}
        </ul>
      </div>
    </div>
  );
}

function UploadRow({
  item,
  onCommand,
}: {
  item: UploadRecord;
  onCommand: (input: UploadCommandInput) => void;
}) {
  const t = useT(uploadsDict);
  const totalBytes = item.files.reduce((sum, file) => sum + file.sizeBytes, 0);
  const risky = item.risk !== 'normal';

  return (
    <li className="flex gap-3 py-4">
      <div className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-surface-raised text-text-secondary">
        <FontAwesomeIcon icon={risky ? faCircleExclamation : faFileArrowUp} className="h-4 w-4" aria-hidden />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <p className="truncate text-sm font-medium text-text-primary">
            {item.files.length === 1 ? item.files[0]?.filename : `${String(item.files.length)} ${t.files}`}
          </p>
          <span className="shrink-0 rounded-full border border-border px-2 py-0.5 text-xs text-text-secondary">
            {t.status[item.status]}
          </span>
          <span className="shrink-0 rounded-full border border-border px-2 py-0.5 text-xs text-text-secondary">
            {t.risk[item.risk]}
          </span>
          <span className="shrink-0 rounded-full border border-border px-2 py-0.5 text-xs text-text-secondary">
            {t.actor[item.provenance.actor]}
          </span>
        </div>
        <p className="mt-1 truncate text-xs text-text-secondary">{item.targetOrigin ?? item.targetUrl ?? '-'}</p>
        <p className="mt-1 text-xs text-text-secondary">{formatBytes(totalBytes, t.bytes)} · {t.redacted}</p>
        {item.files.length > 1 && (
          <ul className="mt-2 flex flex-wrap gap-2">
            {item.files.map((file) => (
              <li key={`${item.id}-${file.filename}`} className="rounded-md bg-surface-raised px-2 py-1 text-xs text-text-secondary">
                {file.filename} · {formatBytes(file.sizeBytes, t.bytes)}
              </li>
            ))}
          </ul>
        )}
        {item.error !== undefined && <p className="mt-2 text-xs text-danger">{item.error}</p>}
        <div className="mt-3 flex flex-wrap gap-2">
          {(item.status === 'staged' || item.status === 'bound') && (
            <ActionButton label={t.action.cancel} icon={faBan} onClick={() => onCommand({ id: item.id, action: 'cancel' })} />
          )}
          {isTerminalUploadStatus(item.status) && (
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
  icon: typeof faBan;
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
