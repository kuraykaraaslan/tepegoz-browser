import { useEffect, useRef, useState } from 'react';
import { resources, resolveLocale, type Locale } from '@tepegoz/i18n';
import { INTERNAL_SETTINGS_URL } from '../../shared/ipc-contract';
import type {
  CredentialsStatus,
  LocalePref,
  Preferences,
  ProviderId,
  TabsState,
  ThemePref,
} from '../../shared/ipc-contract';
import { AgentConsole } from './components/AgentConsole';
import { SettingsPage } from './components/SettingsPage';
import { TitleBar } from './components/TitleBar';
import { Toolbar } from './components/Toolbar';

function effectiveLocale(pref: LocalePref): Locale {
  if (pref === 'en' || pref === 'tr') return pref;
  return resolveLocale(navigator.language);
}

function applyTheme(theme: ThemePref): void {
  const isDark =
    theme === 'dark' ||
    (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', isDark);
}

const EMPTY_TABS: TabsState = { tabs: [], activeId: null, canGoBack: false, canGoForward: false };

export function App() {
  const [prefs, setPrefs] = useState<Preferences | null>(null);
  const [status, setStatus] = useState<CredentialsStatus | null>(null);
  const [tabs, setTabs] = useState<TabsState>(EMPTY_TABS);
  const [agentOpen, setAgentOpen] = useState(false);
  const contentRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const [p, s, ts] = await Promise.all([
          window.tepegoz.getPreferences(),
          window.tepegoz.getCredentialsStatus(),
          window.tepegoz.getTabsState(),
        ]);
        setPrefs(p);
        setStatus(s);
        setTabs(ts);
      } catch {
        // Preload bridge unavailable (dev mishap) — leave defaults; the chrome still renders.
      }
    })();
    return window.tepegoz.onTabsState(setTabs);
  }, []);

  const theme = prefs?.theme ?? 'system';
  useEffect(() => {
    applyTheme(theme);
    if (theme !== 'system') return undefined;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (): void => {
      applyTheme('system');
    };
    mq.addEventListener('change', onChange);
    return () => {
      mq.removeEventListener('change', onChange);
    };
  }, [theme]);

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
  }, []);

  // The Agent Console is a chrome-rendered overlay; it hides the active web view while open.
  // (Settings is a tab with no web view, so it needs no coordination here.)
  useEffect(() => {
    window.tepegoz.setContentVisible(!agentOpen);
  }, [agentOpen]);

  // The native main menu asks the chrome to open the Agent Console (its only chrome-UI action).
  useEffect(() => {
    return window.tepegoz.onMenuAction(() => {
      setAgentOpen(true);
    });
  }, []);

  // App shortcuts (single registry): the accelerators shown in the main menu are wired here. We
  // preventDefault so Ctrl+R reloads the active TAB, not the app chrome.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (!e.ctrlKey && !e.metaKey) return;
      const key = e.key.toLowerCase();
      if (key === 't') {
        e.preventDefault();
        setAgentOpen(false);
        window.tepegoz.createTab();
      } else if (key === 'r') {
        e.preventDefault();
        window.tepegoz.tabReload();
      } else if (key === ',') {
        e.preventDefault();
        setAgentOpen(false);
        window.tepegoz.navigateTab(INTERNAL_SETTINGS_URL); // opens/focuses the Settings tab
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  const locale = effectiveLocale(prefs?.locale ?? 'system');
  const t = resources[locale];
  const activeTab = tabs.tabs.find((tb) => tb.id === tabs.activeId);
  const currentUrl = activeTab?.url ?? '';
  // The internal Settings page is a tab addressed tepegoz://settings; render it when it's active.
  const settingsActive = activeTab?.url === INTERNAL_SETTINGS_URL;

  async function onUpdatePrefs(patch: Partial<Preferences>): Promise<void> {
    setPrefs(await window.tepegoz.updatePreferences(patch));
  }
  async function onSetKey(provider: ProviderId, apiKey: string): Promise<void> {
    setStatus(await window.tepegoz.setProviderKey(provider, apiKey));
  }
  async function onRemoveKey(provider: ProviderId): Promise<void> {
    setStatus(await window.tepegoz.removeProviderKey(provider));
  }

  return (
    <div className="flex h-screen flex-col bg-surface-base text-text-primary">
      <TitleBar
        t={t}
        tabs={tabs.tabs}
        activeId={tabs.activeId}
        onSelectTab={(id) => {
          setAgentOpen(false); // close the Agent overlay when switching tabs
          window.tepegoz.activateTab(id);
        }}
        onNewTab={() => {
          setAgentOpen(false);
          window.tepegoz.createTab();
        }}
      />
      <Toolbar
        t={t}
        currentUrl={currentUrl}
        canGoBack={tabs.canGoBack}
        canGoForward={tabs.canGoForward}
        agentOpen={agentOpen}
        onToggleAgent={() => {
          setAgentOpen((open) => !open);
        }}
      />
      <div ref={contentRef} className="relative flex-1 overflow-hidden">
        {/* The active tab's web page is a separate WebContentsView laid over this area by main. The
            internal Settings tab has no web view, so the chrome renders it here instead. */}
        {settingsActive && (
          <div className="absolute inset-0 bg-surface-base">
            {prefs && status ? (
              <SettingsPage
                t={t}
                prefs={prefs}
                status={status}
                onUpdatePrefs={onUpdatePrefs}
                onSetKey={onSetKey}
                onRemoveKey={onRemoveKey}
              />
            ) : (
              <p className="px-6 py-8 text-sm text-text-secondary">…</p>
            )}
          </div>
        )}
        {agentOpen && (
          <AgentConsole
            t={t}
            onClose={() => {
              setAgentOpen(false);
            }}
          />
        )}
      </div>
    </div>
  );
}
