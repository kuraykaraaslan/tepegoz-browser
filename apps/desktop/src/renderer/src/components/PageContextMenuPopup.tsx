import { useEffect, useRef, useState } from 'react';
import { resolveLocale, type Locale } from '@tepegoz/i18n';
import { I18nProvider, useT } from '@tepegoz/i18n/react';
import { Menu } from '@tepegoz/browser-menu';
import {
  buildPageContextMenuModel,
  type PageContextMenuContext,
} from '@tepegoz/page-context-menu';
import { pageContextMenuDict } from '@tepegoz/page-context-menu/i18n';
import type { PageMenuAction, PageMenuContext } from '@tepegoz/desktop-ipc';
import { applyTheme } from '../lib/theme';

/**
 * Standalone render target for the native page (web view) right-click popup window (loaded with
 * `?surface=page-context-menu`). Mirrors `MainMenuPopup`: fetch prefs → apply theme + locale, Escape
 * closes, self-resize to content, wrap in the I18nProvider. Unlike the main menu it is opened from the
 * MAIN process (the view's `context-menu` event), so on mount it pulls the captured context — which
 * also selects the menu VARIANT (selection / link / image / media / editable / default). Every wired
 * row dispatches its action to main, then dismisses the popup (Chrome-style). Not-yet-implemented rows
 * are disabled placeholders (see the model).
 */

/** Map the IPC context to the model's context (field names align; `pageUrl` isn't needed by the model). */
function toModelContext(c: PageMenuContext | null): PageContextMenuContext {
  return {
    canGoBack: c?.canGoBack ?? false,
    canGoForward: c?.canGoForward ?? false,
    selectionText: c?.selectionText ?? '',
    linkUrl: c?.linkUrl ?? '',
    srcUrl: c?.srcUrl ?? '',
    mediaType: c?.mediaType ?? 'none',
    isEditable: c?.isEditable ?? false,
    canCopy: c?.canCopy ?? false,
    canCut: c?.canCut ?? false,
    canPaste: c?.canPaste ?? false,
    canSelectAll: c?.canSelectAll ?? false,
  };
}

export function PageContextMenuPopup() {
  const [locale, setLocale] = useState<Locale>('en');
  const [ctx, setCtx] = useState<PageMenuContext | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  // Shrink the native popup window to the menu's natural content height (see MainMenuPopup for the why).
  useEffect(() => {
    const el = contentRef.current;
    if (el === null) return;
    const report = (): void => window.tepegoz.resizePopup(Math.ceil(el.getBoundingClientRect().height));
    report();
    const observer = new ResizeObserver(report);
    observer.observe(el);
    return () => observer.disconnect();
  }, [ctx]);

  useEffect(() => {
    void window.tepegoz.getPreferences().then(
      (p) => {
        applyTheme(p.theme, p.themeColor);
        setLocale(p.locale === 'en' || p.locale === 'tr' ? p.locale : resolveLocale(navigator.language));
      },
      () => {
        /* bridge unavailable — fall back to defaults */
      },
    );
    void window.tepegoz.getPageMenuContext().then(setCtx, () => {
      /* bridge unavailable — render the default menu with everything disabled */
    });
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') window.tepegoz.closePopup();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  return (
    <I18nProvider locale={locale}>
      <div className="flex h-screen flex-col overflow-hidden bg-surface-base text-text-primary">
        <div className="min-h-0 flex-1 overflow-auto">
          <div ref={contentRef} className="flow-root">
            <PageContextMenuBody ctx={toModelContext(ctx)} />
          </div>
        </div>
      </div>
    </I18nProvider>
  );
}

/** Builds the model under the I18nProvider (so `useT` resolves) and renders the menu. */
function PageContextMenuBody({ ctx }: { ctx: PageContextMenuContext }) {
  const t = useT(pageContextMenuDict);

  // Every action runs the bridge call, then self-dismisses the popup (Chrome-style).
  const act = (action: PageMenuAction) => (): void => {
    window.tepegoz.pageMenuAction(action);
    window.tepegoz.closePopup();
  };

  const items = buildPageContextMenuModel(t, ctx, {
    back: act('back'),
    forward: act('forward'),
    reload: act('reload'),
    save: act('save'),
    print: act('print'),
    viewSource: act('view-source'),
    inspect: act('inspect'),
    copy: act('copy'),
    cut: act('cut'),
    paste: act('paste'),
    selectAll: act('select-all'),
    searchSelection: act('search-selection'),
    copyLink: act('copy-link'),
    openLinkNewTab: act('open-link-new-tab'),
    copyImage: act('copy-image'),
    copyMediaLink: act('copy-media-link'),
    saveMedia: act('save-media'),
    openMediaNewTab: act('open-media-new-tab'),
  });

  return <Menu items={items} ariaLabel={t.menuLabel} autoFocus />;
}
