import { useEffect, useRef, useState } from 'react';
import { pick, resolveLocale, type Locale } from '@tepegoz/i18n';
import { I18nProvider } from '@tepegoz/i18n/react';
import { Icon } from '@tepegoz/ui';
import {
  INTERNAL_EXTENSIONS_URL,
  isExtensionEnabled,
  type ExtensionId,
  type ExtensionManifestWire,
} from '@tepegoz/desktop-ipc';
import { extensionsDict } from '@tepegoz/extensions-ui/i18n';
import { extensionLabel } from '../../../shared/extension-urls';
import { hasPageAccess, togglePinned } from '../extensions/pinning';
import { iconNodeFor } from '../extensions/icon-registry';
import { applyTheme } from '../lib/theme';

/**
 * The puzzle button's Extensions panel (`?surface=extensions-panel`) — Chrome's extensions menu. Lists
 * every ENABLED extension, grouped by whether it declares page-content access, with a pin toggle per
 * row; clicking a row runs that extension's click action.
 *
 * It is its own native window (a DOM popover would be occluded by the page's WebContentsView), so it
 * fetches its own data and relays row clicks through main (`requestOpenExtension`) — the chrome window
 * owns surface routing. A pin toggle just writes preferences; main's public-settings broadcast makes the
 * toolbar re-read them, so the panel stays open exactly like Chrome's.
 */
export function ExtensionsPanelPopup() {
  const [locale, setLocale] = useState<Locale>('en');
  const [manifests, setManifests] = useState<ExtensionManifestWire[]>([]);
  const [pinnedIds, setPinnedIds] = useState<ExtensionId[]>([]);
  const contentRef = useRef<HTMLDivElement>(null);

  // Shrink the native window to the list's natural height (the open-time height is only an estimate).
  useEffect(() => {
    const el = contentRef.current;
    if (el === null) return;
    const report = (): void => window.tepegoz.resizePopup(Math.ceil(el.getBoundingClientRect().height));
    report();
    const observer = new ResizeObserver(report);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      let prefs;
      try {
        prefs = await window.tepegoz.getPreferences();
      } catch {
        return; // bridge unavailable
      }
      if (cancelled) return;
      applyTheme(prefs.theme, prefs.themeColor);
      setLocale(
        prefs.locale === 'en' || prefs.locale === 'tr' ? prefs.locale : resolveLocale(navigator.language),
      );
      setPinnedIds(prefs.pinnedExtensions);
      try {
        const list = await window.tepegoz.listExtensionManifests();
        if (!cancelled) setManifests(list.filter((m) => isExtensionEnabled(prefs.extensions, m.id)));
      } catch {
        /* ignore — the footer still offers "Manage extensions" */
      }
    })();

    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') window.tepegoz.closePopup();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      cancelled = true;
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  const x = pick(extensionsDict, locale);

  function onTogglePin(id: ExtensionId): void {
    const next = togglePinned(pinnedIds, id);
    setPinnedIds(next); // optimistic: this window owns the checkbox state it just flipped
    void window.tepegoz.updatePreferences({ pinnedExtensions: next }).catch(() => {
      setPinnedIds(pinnedIds); // main rejected the write — put the toggle back
    });
  }

  const withAccess = manifests.filter((m) => hasPageAccess(m));
  const withoutAccess = manifests.filter((m) => !hasPageAccess(m));

  function group(heading: string, items: ExtensionManifestWire[]) {
    if (items.length === 0) return null;
    return (
      <section className="px-2 py-1">
        <h2 className="px-2 py-1 text-xs font-medium text-text-secondary">{heading}</h2>
        <ul>
          {items.map((m) => (
            <ExtensionRow
              key={m.id}
              manifest={m}
              locale={locale}
              pinned={pinnedIds.includes(m.id)}
              pinLabel={pinnedIds.includes(m.id) ? x.unpin : x.pin}
              moreLabel={x.moreOptions}
              onTogglePin={onTogglePin}
            />
          ))}
        </ul>
      </section>
    );
  }

  return (
    <I18nProvider locale={locale}>
      <div className="flex h-screen flex-col overflow-hidden bg-surface-base text-text-primary">
        <div className="min-h-0 flex-1 overflow-auto">
          <div ref={contentRef} className="flow-root">
            <h1 className="px-4 pb-1 pt-3 text-sm font-semibold">{x.title}</h1>
            {manifests.length === 0 ? (
              <p className="px-4 py-3 text-sm text-text-secondary">{x.noneEnabled}</p>
            ) : (
              <>
                {group(x.groupPageAccess, withAccess)}
                {group(x.groupNoAccess, withoutAccess)}
              </>
            )}
            <div className="mt-1 border-t border-border p-2">
              <button
                type="button"
                onClick={() => {
                  window.tepegoz.navigateTab(INTERNAL_EXTENSIONS_URL);
                  window.tepegoz.closePopup();
                }}
                className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left text-sm hover:bg-surface-overlay"
              >
                <Icon name="tools" className="text-text-secondary" />
                {x.manage}
              </button>
            </div>
          </div>
        </div>
      </div>
    </I18nProvider>
  );
}

/** One extension row: click the name to run its action, the thumbtack to pin/unpin, `⋮` for the native
 *  menu (Settings page / Unpin / Remove) — which main relays to the chrome window, not to this popup. */
function ExtensionRow({
  manifest,
  locale,
  pinned,
  pinLabel,
  moreLabel,
  onTogglePin,
}: {
  manifest: ExtensionManifestWire;
  locale: Locale;
  pinned: boolean;
  pinLabel: string;
  moreLabel: string;
  onTogglePin: (id: ExtensionId) => void;
}) {
  const name = extensionLabel(manifest, locale).name;
  return (
    <li className="flex items-center gap-1 rounded-md hover:bg-surface-overlay">
      <button
        type="button"
        title={name}
        onClick={() => window.tepegoz.requestOpenExtension(manifest.id)}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-md px-2 py-2 text-left text-sm"
      >
        <span className="flex h-4 w-4 shrink-0 items-center justify-center text-text-secondary">
          {iconNodeFor(manifest.icon)}
        </span>
        <span className="truncate">{name}</span>
      </button>
      <button
        type="button"
        aria-label={pinLabel}
        aria-pressed={pinned}
        title={pinLabel}
        onClick={() => onTogglePin(manifest.id)}
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md hover:bg-surface-raised ${
          pinned ? 'text-primary' : 'text-text-secondary'
        }`}
      >
        <Icon name={pinned ? 'unpin' : 'pin'} />
      </button>
      <button
        type="button"
        aria-label={moreLabel}
        title={moreLabel}
        onClick={() => window.tepegoz.showExtensionContextMenu(manifest.id)}
        className="mr-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-text-secondary hover:bg-surface-raised"
      >
        <Icon name="ellipsisVertical" />
      </button>
    </li>
  );
}
