import { type ReactNode } from 'react';
import { Omnibox, type OmniboxSuggestion } from '@tepegoz/omnibox';

/** Shared base class for a 32px toolbar icon button. Exported so hosts can style matching controls
 *  (e.g. pinned extension icons) the same way. */
export const NAV_BTN =
  'flex h-8 w-8 items-center justify-center rounded-md text-text-secondary ' +
  'hover:bg-surface-overlay hover:text-text-primary transition-colors ' +
  'disabled:opacity-40 disabled:hover:bg-transparent disabled:cursor-default ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus';

/** Localized aria-labels, supplied by the host so the package stays i18n-agnostic. */
export interface NavToolbarLabels {
  back: string;
  forward: string;
  reload: string;
  menu: string;
  /** Star aria-labels (state-dependent). Optional — omit to hide the bookmark star. */
  bookmarkAdd?: string;
  bookmarkRemove?: string;
}

export interface NavToolbarProps {
  canGoBack: boolean;
  canGoForward: boolean;
  labels: NavToolbarLabels;
  onBack: () => void;
  onForward: () => void;
  onReload: () => void;
  onMenu: () => void;
  /** Omnibox (address bar) inputs — rendered flex-1 between the nav buttons and the actions slot. */
  currentUrl: string;
  omniboxPlaceholder: string;
  onNavigate: (input: string) => void;
  /** Async omnibox suggestion source (history/tab/search); omit to disable the dropdown. */
  onSuggest?: ((query: string) => Promise<OmniboxSuggestion[]>) | undefined;
  /** Switch to an already-open tab (for `activateTab` omnibox suggestions). */
  onActivateTab?: ((tabId: string) => void) | undefined;
  // Bookmark star (Chrome-style, right of the omnibox). Omit onToggleBookmark to hide it entirely.
  /** Whether the active page is bookmarked (filled vs. outline star). */
  isBookmarked?: boolean | undefined;
  /** True only for bookmarkable pages (http(s)); the star is disabled otherwise. */
  canBookmark?: boolean | undefined;
  /** Toggle the active page's bookmark. */
  onToggleBookmark?: (() => void) | undefined;
  /** Host-provided controls between the omnibox and the menu button (e.g. pinned extension icons). */
  actions?: ReactNode;
}

/**
 * `@tepegoz/nav-toolbar` — the browser navigation bar: back / forward / reload, the address bar
 * (`@tepegoz/omnibox`), a host-provided actions slot, and the menu button. All actions are injected,
 * so the package has no dependency on the Electron bridge. Extracted from `apps/desktop` per
 * docs/package-map.md.
 */
export function NavToolbar({
  canGoBack,
  canGoForward,
  labels,
  onBack,
  onForward,
  onReload,
  onMenu,
  currentUrl,
  omniboxPlaceholder,
  onNavigate,
  onSuggest,
  onActivateTab,
  isBookmarked = false,
  canBookmark = false,
  onToggleBookmark,
  actions,
}: NavToolbarProps) {
  return (
    <div className="flex h-11 shrink-0 items-center gap-1 border-b border-border bg-surface-raised px-2">
      <button
        type="button"
        aria-label={labels.back}
        disabled={!canGoBack}
        onClick={onBack}
        className={NAV_BTN}
      >
        <svg className="h-4 w-4" viewBox="0 0 16 16" aria-hidden="true">
          <path
            d="M10 3 L5 8 L10 13"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      <button
        type="button"
        aria-label={labels.forward}
        disabled={!canGoForward}
        onClick={onForward}
        className={NAV_BTN}
      >
        <svg className="h-4 w-4" viewBox="0 0 16 16" aria-hidden="true">
          <path
            d="M6 3 L11 8 L6 13"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      <button type="button" aria-label={labels.reload} onClick={onReload} className={NAV_BTN}>
        <svg className="h-4 w-4" viewBox="0 0 16 16" aria-hidden="true">
          <path
            d="M13 8 A5 5 0 1 1 11.5 4.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
          <path
            d="M13 2 V5 H10"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      <Omnibox
        className="flex-1"
        currentUrl={currentUrl}
        placeholder={omniboxPlaceholder}
        onNavigate={onNavigate}
        onSuggest={onSuggest}
        onActivateTab={onActivateTab}
      />

      {onToggleBookmark !== undefined && (
        <button
          type="button"
          aria-label={isBookmarked ? labels.bookmarkRemove : labels.bookmarkAdd}
          aria-pressed={isBookmarked}
          disabled={!canBookmark}
          onClick={onToggleBookmark}
          className={NAV_BTN}
        >
          <svg
            className="h-4 w-4"
            viewBox="0 0 16 16"
            aria-hidden="true"
            fill={isBookmarked ? 'currentColor' : 'none'}
          >
            <path
              d="M8 1.6 L10 5.7 L14.4 6.3 L11.2 9.4 L12 13.8 L8 11.7 L4 13.8 L4.8 9.4 L1.6 6.3 L6 5.7 Z"
              stroke="currentColor"
              strokeWidth="1.3"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      )}

      {actions}

      <button
        type="button"
        aria-label={labels.menu}
        aria-haspopup="menu"
        onClick={onMenu}
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
