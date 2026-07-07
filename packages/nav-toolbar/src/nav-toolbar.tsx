import { type ReactNode } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faArrowLeft,
  faArrowRight,
  faHouse,
  faRotateRight,
  faStar,
} from '@fortawesome/free-solid-svg-icons';
import { faStar as faStarOutline } from '@fortawesome/free-regular-svg-icons';
import { Omnibox, type OmniboxQuickSettingTarget, type OmniboxSuggestion } from '@tepegoz/omnibox';

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
  home: string;
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
  onHome: () => void;
  /** The main (hamburger) menu control — rendered at the toolbar's trailing edge. The host supplies the
   *  whole element (button + its dropdown) so this package stays presentational and bridge-agnostic. */
  menu: ReactNode;
  /** Omnibox (address bar) inputs — rendered flex-1 between the nav buttons and the actions slot. */
  currentUrl: string;
  omniboxPlaceholder: string;
  onNavigate: (input: string) => void;
  /** Async omnibox suggestion source (history/tab/search); omit to disable the dropdown. */
  onSuggest?: ((query: string) => Promise<OmniboxSuggestion[]>) | undefined;
  /** Switch to an already-open tab (for `activateTab` omnibox suggestions). */
  onActivateTab?: ((tabId: string) => void) | undefined;
  /** Open a high-frequency settings panel from an omnibox suggestion. */
  onOpenQuickSetting?: ((target: OmniboxQuickSettingTarget) => void) | undefined;
  /** Reports the omnibox dropdown height to hosts that need to manage native web-view layering. */
  onOmniboxDropdownHeightChange?: ((height: number) => void) | undefined;
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
  onHome,
  menu,
  currentUrl,
  omniboxPlaceholder,
  onNavigate,
  onSuggest,
  onActivateTab,
  onOpenQuickSetting,
  onOmniboxDropdownHeightChange,
  isBookmarked = false,
  canBookmark = false,
  onToggleBookmark,
  actions,
}: NavToolbarProps) {
  return (
    <div className="chrome-surface relative z-20 flex h-11 shrink-0 items-center gap-1 border-b border-border bg-surface-raised px-2">
      <button
        type="button"
        aria-label={labels.back}
        disabled={!canGoBack}
        onClick={onBack}
        className={NAV_BTN}
      >
        <FontAwesomeIcon icon={faArrowLeft} className="h-4 w-4" aria-hidden />
      </button>
      <button
        type="button"
        aria-label={labels.forward}
        disabled={!canGoForward}
        onClick={onForward}
        className={NAV_BTN}
      >
        <FontAwesomeIcon icon={faArrowRight} className="h-4 w-4" aria-hidden />
      </button>
      <button type="button" aria-label={labels.reload} onClick={onReload} className={NAV_BTN}>
        <FontAwesomeIcon icon={faRotateRight} className="h-4 w-4" aria-hidden />
      </button>
      <button type="button" aria-label={labels.home} onClick={onHome} className={NAV_BTN}>
        <FontAwesomeIcon icon={faHouse} className="h-4 w-4" aria-hidden />
      </button>

      <Omnibox
        className="flex-1"
        currentUrl={currentUrl}
        placeholder={omniboxPlaceholder}
        onNavigate={onNavigate}
        onSuggest={onSuggest}
        onActivateTab={onActivateTab}
        onOpenQuickSetting={onOpenQuickSetting}
        onDropdownHeightChange={onOmniboxDropdownHeightChange}
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
          <FontAwesomeIcon
            icon={isBookmarked ? faStar : faStarOutline}
            className="h-4 w-4"
            aria-hidden
          />
        </button>
      )}

      {actions}

      {menu}
    </div>
  );
}
