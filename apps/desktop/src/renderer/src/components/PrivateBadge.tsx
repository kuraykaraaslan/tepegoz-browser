import { useState } from 'react';
import type { browserDict } from '../../../i18n';

type BrowserStrings = (typeof browserDict)['en'];

/**
 * The private-window badge, and the sentence underneath it.
 *
 * The badge is the easy half. The hard half is the disclosure, which
 * [`phase-2c`](../../../../../phases/product/phase-2c-classic-browser-essentials.md) requires in as many
 * words: **the private-mode surface must say what it does not do.** A separate partition discards local
 * state; it does **not** separate identity. The device, GPU, screen size, fonts, installed-extension
 * signature and network address are unchanged, so a site that fingerprints can link this window to the
 * ordinary one, and the network — an employer, an ISP, a VPN operator — sees the same traffic it always
 * did.
 *
 * Every mainstream browser has been criticised for letting its private mode imply otherwise, usually by
 * saying only what it DOES discard and leaving the reader to infer the rest. So the summary line states
 * the limit before the reassurance, and the expanded panel lists both halves side by side — what is
 * discarded, and what is not hidden. Research:
 * [`cross-profile-tracking.md`](../../../../../../docs/research/research-cross-profile-tracking.md).
 *
 * It is a disclosure, not a warning: the mode is useful and the copy does not scold the user for using
 * it. It just refuses to be read as more than it is.
 */
export function PrivateBadge({ t }: { t: BrowserStrings }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => {
          setOpen((v) => !v);
        }}
        className="flex items-center gap-1.5 rounded-full bg-surface-overlay px-2.5 py-1 text-xs text-text-secondary hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
      >
        <span aria-hidden>🕶</span>
        <span>{t.privateBadge}</span>
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-1 w-80 rounded-lg border border-border bg-surface-raised p-3 shadow-lg">
          <p className="text-sm font-medium text-text-primary">{t.privateTitle}</p>
          {/* The limit FIRST. A panel that opens with the reassurance and buries the caveat below the
              fold is how every browser earned this criticism. */}
          <p className="mt-1 text-xs text-text-secondary">{t.privateNotHidden}</p>
          <p className="mt-2 text-xs font-medium text-text-primary">{t.privateDiscardsTitle}</p>
          <ul className="mt-1 list-disc pl-4 text-xs text-text-secondary">
            <li>{t.privateDiscardsState}</li>
            <li>{t.privateDiscardsHistory}</li>
            <li>{t.privateDiscardsSession}</li>
          </ul>
          <p className="mt-2 text-xs font-medium text-text-primary">{t.privateKeepsTitle}</p>
          <ul className="mt-1 list-disc pl-4 text-xs text-text-secondary">
            <li>{t.privateKeepsFingerprint}</li>
            <li>{t.privateKeepsNetwork}</li>
            <li>{t.privateKeepsDownloads}</li>
          </ul>
          <p className="mt-2 text-xs text-text-secondary">{t.privateLockout}</p>
        </div>
      )}
    </div>
  );
}
