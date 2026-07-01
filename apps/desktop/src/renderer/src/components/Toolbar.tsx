import { useEffect, useState } from 'react';
import { cn } from '@tepegoz/ui';
import type { Resources } from '@tepegoz/i18n';
import { INTERNAL_EXTENSIONS_URL, type ExtensionId } from '../../../shared/ipc-contract';
import type { ExtensionDef } from '../extensions/registry';
import { evaluateOmniboxCalc } from '../lib/omnibox-calc';

/** Max extension icons pinned inline next to the omnibox; beyond this, use the puzzle → manage page. */
const MAX_INLINE_EXTENSIONS = 4;

interface ToolbarProps {
  t: Resources;
  currentUrl: string;
  canGoBack: boolean;
  canGoForward: boolean;
  /** Enabled extensions, shown as icons to the right of the address bar (Chrome-style). */
  extensions: readonly ExtensionDef[];
  openExtension: ExtensionId | null;
  onOpenExtension: (id: ExtensionId) => void;
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
  extensions,
  openExtension,
  onOpenExtension,
}: ToolbarProps) {
  const [value, setValue] = useState(currentUrl);
  const [focused, setFocused] = useState(false);

  // Keep the omnibox in sync with the active tab's URL, except while the user is editing it.
  useEffect(() => {
    if (!focused) setValue(currentUrl);
  }, [currentUrl, focused]);

  const calc = value.trim().length > 0 ? evaluateOmniboxCalc(value) : null;

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
        className="relative flex-1"
        onSubmit={(e) => {
          e.preventDefault();
          // Inline calculation: if the whole input is arithmetic, compute it (copy the result to the
          // clipboard) instead of navigating — the omnibox never starts an AI thread (Comet lesson).
          if (calc !== null) {
            void navigator.clipboard?.writeText(calc.formatted);
            setValue(calc.formatted);
            return;
          }
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
          className={cn(
            'h-8 w-full rounded-full border border-border bg-surface-base px-4 text-sm text-text-primary placeholder:text-text-disabled focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus',
            calc !== null && 'pr-24',
          )}
        />
        {calc !== null && (
          <span
            aria-live="polite"
            className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rounded bg-surface-overlay px-2 py-0.5 font-mono text-xs text-text-secondary"
          >
            = {calc.formatted}
          </span>
        )}
      </form>

      {/* Enabled extensions, pinned as icons to the right of the address bar (Chrome-style). */}
      {extensions.length <= MAX_INLINE_EXTENSIONS &&
        extensions.map((ext) => (
          <button
            key={ext.id}
            type="button"
            aria-label={t.extensions.names[ext.id]}
            aria-pressed={openExtension === ext.id}
            title={t.extensions.names[ext.id]}
            onClick={() => {
              onOpenExtension(ext.id);
            }}
            className={cn(NAV_BTN, openExtension === ext.id && 'bg-surface-overlay text-text-primary')}
          >
            {ext.icon}
          </button>
        ))}
      {/* Puzzle: manage/overflow — opens the tepegoz://extensions page (like Chrome's puzzle piece). */}
      <button
        type="button"
        aria-label={t.extensions.manage}
        title={t.extensions.manage}
        onClick={() => window.tepegoz.navigateTab(INTERNAL_EXTENSIONS_URL)}
        className={NAV_BTN}
      >
        <svg className="h-4 w-4" viewBox="0 0 16 16" aria-hidden="true">
          <path
            d="M9.5 2a1.5 1.5 0 0 0-1.5 1.5V4H6a1 1 0 0 0-1 1v2h-.5a1.5 1.5 0 1 0 0 3H5v2a1 1 0 0 0 1 1h2v-.5a1.5 1.5 0 0 1 3 0V13h1a1 1 0 0 0 1-1v-2h.5a1.5 1.5 0 1 0 0-3H13V5a1 1 0 0 0-1-1h-1v-.5A1.5 1.5 0 0 0 9.5 2Z"
            fill="currentColor"
          />
        </svg>
      </button>

      <button
        type="button"
        aria-label={t.browser.menu}
        aria-haspopup="menu"
        onClick={() => window.tepegoz.showMainMenu()}
        className={NAV_BTN}
      >
        <svg className="h-4 w-4" viewBox="0 0 16 16" aria-hidden="true">
          <circle cx="8" cy="3.2" r="1.3" fill="currentColor" />
          <circle cx="8" cy="8" r="1.3" fill="currentColor" />
          <circle cx="8" cy="12.8" r="1.3" fill="currentColor" />
        </svg>
      </button>
    </div>
  );
}
