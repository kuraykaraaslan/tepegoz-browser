import { useEffect, useRef, useState } from 'react';
import { NAV_BTN } from '@tepegoz/nav-toolbar';
import { cn, Icon } from '@tepegoz/ui';
import { useT } from '@tepegoz/i18n/react';
import type { DownloadRecord } from '@tepegoz/downloads';
import type { UploadRecord } from '@tepegoz/uploads';
import { transferDict } from '../../../i18n';

const POPUP_HEIGHT = 520;

/**
 * What "finished" means for the "show downloads when they're done" preference.
 *
 * Canceled is absent on purpose: the user cancelled it, so they already know, and popping a panel at
 * them for their own action is the kind of helpfulness that gets a setting turned off. `blocked` and
 * `failed` ARE here — an outcome the user did not ask for is exactly the one worth showing.
 */
const ANNOUNCE_ON: readonly string[] = ['quarantined', 'completed', 'blocked', 'failed'];

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
  /** Last seen status per download id — the only way to tell a NEW ending from a re-render. */
  const statusesRef = useRef(new Map<string, string>());
  const openRef = useRef(false);
  openRef.current = open;
  const [uploads, setUploads] = useState<UploadRecord[]>([]);

  useEffect(() => {
    void window.tepegoz.listDownloads().then(setDownloads, () => {
      /* bridge unavailable */
    });
    void window.tepegoz.listUploads().then(setUploads, () => {
      /* bridge unavailable */
    });
    const offDownloads = window.tepegoz.onDownloadsState((state) => {
      setDownloads(state.items);
      announceFinished(state.items);
    });
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

  /**
   * Open the panel once, when a transfer reaches its end and the preference asks for it.
   *
   * The preference is read AT the moment it would act rather than cached on mount: it is a private
   * setting, so it is not broadcast, and a cached copy would ignore the toggle until the chrome was
   * reloaded. One IPC call per finished transfer is cheaper than being wrong.
   */
  function announceFinished(items: DownloadRecord[]): void {
    const previous = statusesRef.current;
    const finished = items.filter(
      (item) =>
        ANNOUNCE_ON.includes(item.status) && previous.get(item.id) !== item.status &&
        previous.has(item.id),
    );
    statusesRef.current = new Map(items.map((item) => [item.id, item.status]));
    // `previous.has` above is what stops the panel opening for downloads that were already finished
    // when the chrome mounted — restoring a list of yesterday's downloads is not an event.
    if (finished.length === 0 || openRef.current) return;
    void window.tepegoz.getPreferences().then(
      (prefs) => {
        if (prefs.showDownloadsWhenDone) openPanel();
      },
      () => {
        /* bridge unavailable — never guess a yes for a panel that steals attention */
      },
    );
  }

  function openPanel(): void {
    const el = ref.current;
    if (el === null) return;
    const r = el.getBoundingClientRect();
    window.tepegoz.openPopup(
      'transfers',
      { x: r.x, y: r.y, width: r.width, height: r.height },
      { height: POPUP_HEIGHT },
    );
    setOpen(true);
  }

  function onClick(): void {
    const el = ref.current;
    if (el === null) return;
    if (open) {
      window.tepegoz.closePopup();
      setOpen(false);
      return;
    }
    openPanel();
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
