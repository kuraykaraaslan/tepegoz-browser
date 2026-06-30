import { useEffect, useState } from 'react';
import { cn } from '@tepegoz/ui';
import type { Resources } from '@tepegoz/i18n';

interface ToolbarProps {
  t: Resources;
  currentUrl: string;
  canGoBack: boolean;
  canGoForward: boolean;
  settingsOpen: boolean;
  onToggleSettings: () => void;
}

const NAV_BTN =
  'flex h-8 w-8 items-center justify-center rounded-md text-text-secondary ' +
  'hover:bg-surface-overlay hover:text-text-primary transition-colors ' +
  'disabled:opacity-40 disabled:hover:bg-transparent disabled:cursor-default ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus';

export function Toolbar({
  t,
  currentUrl,
  canGoBack,
  canGoForward,
  settingsOpen,
  onToggleSettings,
}: ToolbarProps) {
  const [value, setValue] = useState(currentUrl);
  const [focused, setFocused] = useState(false);

  // Keep the omnibox in sync with the active tab's URL, except while the user is editing it.
  useEffect(() => {
    if (!focused) setValue(currentUrl);
  }, [currentUrl, focused]);

  return (
    <div className="flex h-11 shrink-0 items-center gap-1 border-b border-border bg-surface-raised px-2">
      <button
        type="button"
        aria-label={t.browser.back}
        disabled={!canGoBack}
        onClick={() => window.tepegoz.tabGoBack()}
        className={NAV_BTN}
      >
        <svg className="h-4 w-4" viewBox="0 0 16 16" aria-hidden="true">
          <path d="M10 3 L5 8 L10 13" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <button
        type="button"
        aria-label={t.browser.forward}
        disabled={!canGoForward}
        onClick={() => window.tepegoz.tabGoForward()}
        className={NAV_BTN}
      >
        <svg className="h-4 w-4" viewBox="0 0 16 16" aria-hidden="true">
          <path d="M6 3 L11 8 L6 13" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <button
        type="button"
        aria-label={t.browser.reload}
        onClick={() => window.tepegoz.tabReload()}
        className={NAV_BTN}
      >
        <svg className="h-4 w-4" viewBox="0 0 16 16" aria-hidden="true">
          <path d="M13 8 A5 5 0 1 1 11.5 4.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          <path d="M13 2 V5 H10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      <form
        className="flex-1"
        onSubmit={(e) => {
          e.preventDefault();
          window.tepegoz.navigateTab(value);
          // Keep focus (and the typed value) until navigation commits; the focus guard then re-syncs
          // to the real URL on blur. Blurring here would snap the box back to the OLD url mid-load.
        }}
      >
        <input
          type="text"
          value={value}
          placeholder={t.browser.omniboxPlaceholder}
          spellCheck={false}
          aria-label={t.browser.omniboxPlaceholder}
          onChange={(e) => setValue(e.target.value)}
          onFocus={(e) => {
            setFocused(true);
            e.target.select();
          }}
          onBlur={() => setFocused(false)}
          className="h-8 w-full rounded-full border border-border bg-surface-base px-4 text-sm text-text-primary placeholder:text-text-disabled focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
        />
      </form>

      <button
        type="button"
        aria-label={t.browser.settings}
        aria-pressed={settingsOpen}
        onClick={onToggleSettings}
        className={cn(NAV_BTN, settingsOpen && 'bg-surface-overlay text-text-primary')}
      >
        <svg className="h-4 w-4" viewBox="0 0 16 16" aria-hidden="true">
          <circle cx="8" cy="8" r="2.2" fill="none" stroke="currentColor" strokeWidth="1.4" />
          <path
            d="M8 1.5 v2 M8 12.5 v2 M1.5 8 h2 M12.5 8 h2 M3.4 3.4 l1.4 1.4 M11.2 11.2 l1.4 1.4 M12.6 3.4 l-1.4 1.4 M4.8 11.2 l-1.4 1.4"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinecap="round"
          />
        </svg>
      </button>
    </div>
  );
}
