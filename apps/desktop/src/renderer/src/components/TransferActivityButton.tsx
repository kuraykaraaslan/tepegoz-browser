import { useEffect, useRef, useState } from 'react';
import { NAV_BTN } from '@tepegoz/nav-toolbar';
import { cn, Icon } from '@tepegoz/ui';
import { useT } from '@tepegoz/i18n/react';
import type { DownloadRecord } from '@tepegoz/downloads';
import type { UploadRecord } from '@tepegoz/uploads';
import { transferDict } from '../../../i18n';

const POPUP_HEIGHT = 520;

function activeDownload(item: DownloadRecord): boolean {
  return ['requested', 'in_progress', 'paused', 'quarantined'].includes(item.status);
}

function activeUpload(item: UploadRecord): boolean {
  return ['staged', 'bound', 'submitting'].includes(item.status);
}

export function TransferActivityButton() {
  const t = useT(transferDict);
  const ref = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [downloads, setDownloads] = useState<DownloadRecord[]>([]);
  const [uploads, setUploads] = useState<UploadRecord[]>([]);

  useEffect(() => {
    void window.tepegoz.listDownloads().then(setDownloads, () => {
      /* bridge unavailable */
    });
    void window.tepegoz.listUploads().then(setUploads, () => {
      /* bridge unavailable */
    });
    const offDownloads = window.tepegoz.onDownloadsState((state) => setDownloads(state.items));
    const offUploads = window.tepegoz.onUploadsState((state) => setUploads(state.items));
    const offClosed = window.tepegoz.onPopupClosed((surface) => {
      if (surface === 'transfers') setOpen(false);
    });
    return () => {
      offDownloads();
      offUploads();
      offClosed();
    };
  }, []);

  const total = downloads.length + uploads.length;
  const active = downloads.filter(activeDownload).length + uploads.filter(activeUpload).length;
  if (total === 0 && !open) return null;

  function onClick(): void {
    const el = ref.current;
    if (el === null) return;
    if (open) {
      window.tepegoz.closePopup();
      setOpen(false);
      return;
    }
    const r = el.getBoundingClientRect();
    window.tepegoz.openPopup(
      'transfers',
      { x: r.x, y: r.y, width: r.width, height: r.height },
      { height: POPUP_HEIGHT },
    );
    setOpen(true);
  }

  return (
    <button
      ref={ref}
      type="button"
      aria-label={t.title}
      aria-haspopup="dialog"
      aria-expanded={open}
      onClick={onClick}
      className={cn(NAV_BTN, 'relative', active > 0 ? 'text-text-primary' : 'text-text-secondary')}
    >
      <Icon name="transfers" />
      {active > 0 && (
        <span
          aria-hidden="true"
          className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-none text-primary-fg"
        >
          {active > 9 ? '9+' : String(active)}
        </span>
      )}
    </button>
  );
}
