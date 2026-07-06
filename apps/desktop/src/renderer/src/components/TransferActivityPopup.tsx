import { useEffect, useMemo, useRef, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faArrowDown,
  faArrowUp,
  faArrowUpRightFromSquare,
  faCircleExclamation,
  faFile,
} from '@fortawesome/free-solid-svg-icons';
import { resolveLocale, type Locale } from '@tepegoz/i18n';
import { I18nProvider, useT } from '@tepegoz/i18n/react';
import {
  INTERNAL_DOWNLOADS_URL,
  INTERNAL_UPLOADS_URL,
  type DownloadRecord,
  type UploadRecord,
} from '@tepegoz/desktop-ipc';
import { downloadsDict } from '@tepegoz/downloads-ui/i18n';
import { uploadsDict } from '@tepegoz/uploads-ui/i18n';
import { transferDict } from '../../../i18n';
import { applyTheme } from '../lib/theme';

type TransferItem =
  | { kind: 'download'; id: string; updatedAt: number; record: DownloadRecord }
  | { kind: 'upload'; id: string; updatedAt: number; record: UploadRecord };

const MAX_ITEMS = 10;

function formatBytes(value: number, units: { b: string; kb: string; mb: string; gb: string }): string {
  if (value < 1024) return `${value} ${units.b}`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} ${units.kb}`;
  if (value < 1024 * 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} ${units.mb}`;
  return `${(value / (1024 * 1024 * 1024)).toFixed(1)} ${units.gb}`;
}

function formatRelative(ts: number, locale: Locale): string {
  const diff = ts - Date.now();
  const abs = Math.abs(diff);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto', style: 'short' });
  const MIN = 60_000;
  const HOUR = 3_600_000;
  const DAY = 86_400_000;
  if (abs < MIN) return rtf.format(Math.round(diff / 1000), 'second');
  if (abs < HOUR) return rtf.format(Math.round(diff / MIN), 'minute');
  if (abs < DAY) return rtf.format(Math.round(diff / HOUR), 'hour');
  return rtf.format(Math.round(diff / DAY), 'day');
}

function uploadTitle(item: UploadRecord, filesLabel: string): string {
  if (item.files.length === 1) return item.files[0]?.filename ?? filesLabel;
  return `${String(item.files.length)} ${filesLabel}`;
}

function uploadBytes(item: UploadRecord): number {
  return item.files.reduce((sum, file) => sum + file.sizeBytes, 0);
}

export function TransferActivityPopup() {
  const [locale, setLocale] = useState<Locale>('en');
  const [downloads, setDownloads] = useState<DownloadRecord[]>([]);
  const [uploads, setUploads] = useState<UploadRecord[]>([]);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = contentRef.current;
    if (el === null) return undefined;
    const report = (): void => window.tepegoz.resizePopup(Math.ceil(el.getBoundingClientRect().height));
    report();
    const observer = new ResizeObserver(report);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    void window.tepegoz.getPreferences().then(
      (p) => {
        applyTheme(p.theme, p.themeColor);
        setLocale(p.locale === 'en' || p.locale === 'tr' ? p.locale : resolveLocale(navigator.language));
      },
      () => {
        /* bridge unavailable */
      },
    );
    void window.tepegoz.listDownloads().then(setDownloads, () => {
      /* ignore */
    });
    void window.tepegoz.listUploads().then(setUploads, () => {
      /* ignore */
    });
    const offDownloads = window.tepegoz.onDownloadsState((state) => setDownloads(state.items));
    const offUploads = window.tepegoz.onUploadsState((state) => setUploads(state.items));
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') window.tepegoz.closePopup();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      offDownloads();
      offUploads();
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  return (
    <I18nProvider locale={locale}>
      <div className="flex h-screen flex-col overflow-hidden bg-surface-base text-text-primary">
        <div ref={contentRef} className="flow-root">
          <TransferActivityContent downloads={downloads} uploads={uploads} locale={locale} />
        </div>
      </div>
    </I18nProvider>
  );
}

function TransferActivityContent({
  downloads,
  uploads,
  locale,
}: {
  downloads: DownloadRecord[];
  uploads: UploadRecord[];
  locale: Locale;
}) {
  const t = useT(transferDict);
  const items = useMemo<TransferItem[]>(
    () =>
      [
        ...downloads.map((record) => ({
          kind: 'download' as const,
          id: `download:${record.id}`,
          updatedAt: record.updatedAt,
          record,
        })),
        ...uploads.map((record) => ({
          kind: 'upload' as const,
          id: `upload:${record.id}`,
          updatedAt: record.updatedAt,
          record,
        })),
      ]
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, MAX_ITEMS),
    [downloads, uploads],
  );

  return (
    <div className="w-full">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h1 className="text-sm font-semibold">{t.title}</h1>
        <button
          type="button"
          aria-label={t.close}
          onClick={() => window.tepegoz.closePopup()}
          className="flex h-7 w-7 items-center justify-center rounded-full text-text-secondary hover:bg-surface-overlay hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
        >
          X
        </button>
      </div>
      {items.length === 0 ? (
        <p className="px-4 py-8 text-sm text-text-secondary">{t.empty}</p>
      ) : (
        <ul className="max-h-[26rem] overflow-auto py-1">
          {items.map((item) =>
            item.kind === 'download' ? (
              <DownloadTransferRow key={item.id} item={item.record} locale={locale} />
            ) : (
              <UploadTransferRow key={item.id} item={item.record} locale={locale} />
            ),
          )}
        </ul>
      )}
      <div className="grid grid-cols-2 border-t border-border text-xs font-medium">
        <FooterButton label={t.fullDownloads} onClick={() => navigateInternal(INTERNAL_DOWNLOADS_URL)} />
        <FooterButton label={t.fullUploads} onClick={() => navigateInternal(INTERNAL_UPLOADS_URL)} />
      </div>
    </div>
  );
}

function DownloadTransferRow({ item, locale }: { item: DownloadRecord; locale: Locale }) {
  const td = useT(downloadsDict);
  const size = item.totalBytes ?? item.receivedBytes;
  const status = td.status[item.status];
  const detail = `${formatBytes(size, td.bytes)} · ${status} · ${formatRelative(item.updatedAt, locale)}`;
  const risky = item.risk !== 'normal' || item.trustVerdict === 'blocked';

  return (
    <li className="flex gap-3 px-4 py-2.5 hover:bg-surface-overlay">
      <TransferIcon direction="download" risky={risky} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{item.filename}</p>
        <p className="mt-0.5 truncate text-xs text-text-secondary">{detail}</p>
        <p className="mt-0.5 truncate text-xs text-text-muted">{item.provenance.sourceOrigin ?? item.url}</p>
      </div>
    </li>
  );
}

function UploadTransferRow({ item, locale }: { item: UploadRecord; locale: Locale }) {
  const tu = useT(uploadsDict);
  const status = tu.status[item.status];
  const detail = `${formatBytes(uploadBytes(item), tu.bytes)} · ${status} · ${formatRelative(item.updatedAt, locale)}`;
  const risky = item.risk !== 'normal';

  return (
    <li className="flex gap-3 px-4 py-2.5 hover:bg-surface-overlay">
      <TransferIcon direction="upload" risky={risky} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{uploadTitle(item, tu.files)}</p>
        <p className="mt-0.5 truncate text-xs text-text-secondary">{detail}</p>
        <p className="mt-0.5 truncate text-xs text-text-muted">{item.targetOrigin ?? item.targetUrl ?? '-'}</p>
      </div>
    </li>
  );
}

function TransferIcon({ direction, risky }: { direction: 'download' | 'upload'; risky: boolean }) {
  return (
    <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-surface-raised text-text-secondary">
      <span className="relative">
        <FontAwesomeIcon icon={faFile} className="h-4 w-4" aria-hidden />
        <FontAwesomeIcon
          icon={risky ? faCircleExclamation : direction === 'download' ? faArrowDown : faArrowUp}
          className="absolute -bottom-1 -right-1 h-2.5 w-2.5 text-primary"
          aria-hidden
        />
      </span>
    </div>
  );
}

function FooterButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center justify-between gap-2 px-4 py-3 text-left hover:bg-surface-overlay focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
    >
      <span className="truncate">{label}</span>
      <FontAwesomeIcon icon={faArrowUpRightFromSquare} className="h-3 w-3 text-text-secondary" aria-hidden />
    </button>
  );
}

function navigateInternal(url: string): void {
  window.tepegoz.navigateTab(url);
  window.tepegoz.closePopup();
}
