import { useEffect, type Dispatch, type RefObject, type SetStateAction } from 'react';
import { localeDir, type Locale } from '@tepegoz/i18n';
import { INTERNAL_SETTINGS_URL } from '@tepegoz/desktop-ipc';
import { pressFromEvent, shortcutFor } from '@tepegoz/shortcuts';
import type {
  AppNotification,
  AutofillAvailablePayload,
  ExtensionId,
  NotificationPermissionRequest,
  Preferences,
  TabsState,
} from '@tepegoz/desktop-ipc';
import { extensionPageUrl } from '../../shared/extension-urls';
import { applyTheme } from './lib/theme';
import type { ExtensionSurfacesResult } from './app-extension-surfaces';

export interface AppEffectsParams {
  prefs: Preferences | null;
  locale: Locale;
  glassAvailable: boolean;
  omniboxDropdownOpen: boolean;
  contentRef: RefObject<HTMLDivElement | null>;
  extSurfaces: ExtensionSurfacesResult;
  onToggleExtension: (id: ExtensionId, enabled: boolean) => void;
  onUnpinExtension: (id: ExtensionId) => void;
  setPrefs: Dispatch<SetStateAction<Preferences | null>>;
  setTabs: Dispatch<SetStateAction<TabsState>>;
  setRenamingGroupId: Dispatch<SetStateAction<string | null>>;
  setToasts: Dispatch<SetStateAction<AppNotification[]>>;
  setPermReq: Dispatch<SetStateAction<NotificationPermissionRequest | null>>;
  setAutofill: Dispatch<SetStateAction<AutofillAvailablePayload | null>>;
  setGlassAvailable: Dispatch<SetStateAction<boolean>>;
  setOmniboxViewHidden: Dispatch<SetStateAction<boolean>>;
  setOmniboxSnapshot: Dispatch<SetStateAction<string | null>>;
}

/**
 * The App shell's cross-cutting side effects — initial IPC state fetch + subscriptions, theme/glass
 * chrome application, content-bounds reporting, omnibox snapshotting, and app-wide keyboard shortcuts.
 * Split out of `App.tsx` (ADR-0010 250-line cap); pure mechanical extraction, behaviour unchanged.
 */
export function useAppEffects(params: AppEffectsParams): void {
  const {
    prefs,
    locale,
    glassAvailable,
    omniboxDropdownOpen,
    contentRef,
    extSurfaces,
    onToggleExtension,
    onUnpinExtension,
    setPrefs,
    setTabs,
    setRenamingGroupId,
    setToasts,
    setPermReq,
    setAutofill,
    setGlassAvailable,
    setOmniboxViewHidden,
    setOmniboxSnapshot,
  } = params;

  useEffect(() => {
    void (async () => {
      try {
        const [p, ts] = await Promise.all([
          window.tepegoz.getPreferences(),
          window.tepegoz.getTabsState(),
        ]);
        setPrefs(p);
        setTabs(ts);
      } catch (err) {
        // Preload bridge unavailable (dev mishap) — leave defaults; the chrome still renders.
        console.warn('Initial IPC state fetch failed — rendering with defaults', err);
      }
    })();
    const unsubTabs = window.tepegoz.onTabsState(setTabs);
    const unsubRename = window.tepegoz.onTabGroupStartRename(setRenamingGroupId);
    return () => {
      unsubTabs();
      unsubRename();
    };
  }, [setPrefs, setTabs, setRenamingGroupId]);

  // Transient toasts: append each pushed toast (capped to the newest 3; individual auto-dismiss timers
  // live in the ToastStack).
  useEffect(() => {
    return window.tepegoz.onNotificationToast((toast) => {
      setToasts((prev) => [...prev, toast].slice(-3));
    });
  }, [setToasts]);

  // Per-site Web Notification consent prompts from the main-process broker. Only one at a time (the
  // broker serializes); a new one replaces any still-open prompt.
  useEffect(() => {
    return window.tepegoz.onNotificationPermissionRequest(setPermReq);
  }, [setPermReq]);

  // Autofill: main pushes matching credentials when a page finishes loading. Navigating away clears.
  useEffect(() => {
    return window.tepegoz.onAutofillAvailable((payload) => {
      setAutofill(payload);
    });
  }, [setAutofill]);

  // One-shot: does this OS support the glass (Win11 Mica) chrome?
  useEffect(() => {
    void window.tepegoz.getAppInfo().then(
      (info) => setGlassAvailable(info.glassAvailable),
      () => setGlassAvailable(false),
    );
  }, [setGlassAvailable]);

  // Mirror the active locale onto the document root.
  //
  // `dir` is RTL-readiness: both shipping locales are LTR, so it is a no-op today, but the surface is
  // wired for a future RTL locale (ADR-0016).
  //
  // `lang` is not a no-op and was missing. `index.html` hardcodes `lang="en"`, so a Turkish UI was
  // announced to a screen reader with English pronunciation rules — WCAG 3.1.1 (Language of Page),
  // and the kind of failure nobody sees on screen. It also decides which hyphenation and font
  // fallbacks the engine picks, so the visible text is subtly wrong too.
  useEffect(() => {
    document.documentElement.dir = localeDir(locale);
    document.documentElement.lang = locale;
  }, [locale]);

  const theme = prefs?.theme ?? 'system';
  const themeColor = prefs?.themeColor ?? '';
  useEffect(() => {
    applyTheme(theme, themeColor);
    // Only follow OS changes for the plain system mode (a custom color overrides it).
    if (theme !== 'system' || themeColor !== '') return undefined;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (): void => {
      applyTheme('system', '');
    };
    mq.addEventListener('change', onChange);
    return () => {
      mq.removeEventListener('change', onChange);
    };
  }, [theme, themeColor]);

  // Mark the root for glass chrome so the `.glass` CSS makes the shell/bars translucent, in lockstep with
  // the native Mica backdrop the main process applies. On non-Win11 the pref is on but main never enables
  // the material, so the translucency would reveal the opaque shell — harmless, but keep the class off
  // there by gating on the runtime capability (fetched into `glassAvailable`).
  const glassChrome = prefs?.glassChrome ?? false;
  useEffect(() => {
    document.documentElement.classList.toggle('glass', glassChrome && glassAvailable);
  }, [glassChrome, glassAvailable]);

  // Tell main where to lay out the active tab's web view (the content area below the chrome).
  useEffect(() => {
    const el = contentRef.current;
    if (el === null) return undefined;
    const report = (): void => {
      const r = el.getBoundingClientRect();
      window.tepegoz.setContentBounds({
        x: Math.round(r.left),
        y: Math.round(r.top),
        width: Math.round(r.width),
        height: Math.round(r.height),
      });
    };
    report();
    const observer = new ResizeObserver(report);
    observer.observe(el);
    window.addEventListener('resize', report);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', report);
    };
  }, [contentRef]);

  // Native WebContentsViews sit above the renderer DOM, so the omnibox list cannot simply z-index over
  // a live page. While suggestions are open, paint a still of the page and detach the live view.
  useEffect(() => {
    let cancelled = false;
    if (!omniboxDropdownOpen) {
      setOmniboxViewHidden(false);
      setOmniboxSnapshot(null);
      return undefined;
    }
    window.tepegoz
      .captureActiveTab()
      .then((snap) => {
        if (cancelled) return;
        setOmniboxSnapshot(snap);
        setOmniboxViewHidden(true);
      })
      .catch(() => {
        if (!cancelled) setOmniboxViewHidden(true);
      });
    return () => {
      cancelled = true;
    };
  }, [omniboxDropdownOpen, setOmniboxViewHidden, setOmniboxSnapshot]);

  // Keep prefs fresh when ANOTHER window changes them (the Bookmarks menu toggling the bookmarks bar,
  // etc.) — main broadcasts on every prefs write. Refetch the full prefs so the bar re-renders live.
  useEffect(() => {
    return window.tepegoz.onPublicSettingsChanged(() => {
      void window.tepegoz.getPreferences().then(setPrefs, () => {
        /* bridge unavailable — keep the last known prefs */
      });
    });
  }, [setPrefs]);

  // Right-click on a toolbar extension icon (or an Extensions-panel row) → the native menu relays the
  // chosen action back here so it runs against our authoritative React state: open its settings page,
  // unpin it from the toolbar, or remove (disable) it.
  useEffect(() => {
    return window.tepegoz.onExtensionContextMenuAction(({ id, action }) => {
      if (action === 'page') {
        extSurfaces.closeSurface();
        window.tepegoz.navigateTab(extensionPageUrl(id));
      } else if (action === 'unpin') {
        onUnpinExtension(id);
      } else {
        onToggleExtension(id, false);
      }
    });
  }, [onToggleExtension, onUnpinExtension, extSurfaces]);

  // App shortcuts (single registry): the accelerators shown in the main menu are wired here. We
  // preventDefault so Ctrl+R reloads the active TAB, not the app chrome.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      // Every global key goes through the one registry (`@tepegoz/shortcuts`), which matches modifiers
      // EXACTLY. The hand-rolled test this replaces checked `ctrlKey || metaKey` and never looked at
      // Alt, so Ctrl+Alt+T (a terminal on Linux, and AltGr territory on a Turkish-Q keyboard) opened a
      // tab, and Ctrl+Shift+R did a plain reload instead of leaving the hard-reload combination alone.
      const id = shortcutFor(pressFromEvent(e), 'renderer');
      if (id === null || id === 'commandPalette') return;
      e.preventDefault();
      if (id === 'reopenClosedTab') {
        extSurfaces.closeSurface();
        window.tepegoz.reopenClosedTab();
      } else if (id === 'newTab') {
        extSurfaces.closeSurface();
        window.tepegoz.createTab();
        // `reload` used to be handled here. It moved to `main` scope: renderer-scope meant it only
        // fired while the CHROME had focus, and while a page had focus the key was being answered by
        // Electron's default application menu rather than by this app at all.
      } else if (id === 'settings') {
        extSurfaces.closeSurface();
        window.tepegoz.navigateTab(INTERNAL_SETTINGS_URL); // opens/focuses the Settings tab
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, []);
}
