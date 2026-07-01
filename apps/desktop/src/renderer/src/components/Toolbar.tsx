import { useEffect, useRef } from 'react';
import { cn } from '@tepegoz/ui';
import { Omnibox } from '@tepegoz/omnibox';
import type { Locale, Resources } from '@tepegoz/i18n';
import { INTERNAL_EXTENSIONS_URL, type ContentBounds } from '../../../shared/ipc-contract';
import { extensionLabel } from '../../../shared/extensions';
import type { ExtensionDef } from '../extensions/registry';

/** Max extension icons pinned inline next to the omnibox; beyond this, use the puzzle → manage page. */
const MAX_INLINE_EXTENSIONS = 4;
/** Window (ms) to wait for a second click before firing the single-click action (icons with a
 *  double-click binding only). */
const DOUBLE_CLICK_MS = 220;

interface ToolbarProps {
  t: Resources;
  locale: Locale;
  currentUrl: string;
  canGoBack: boolean;
  canGoForward: boolean;
  /** Enabled extensions, shown as icons to the right of the address bar (Chrome-style). */
  extensions: readonly ExtensionDef[];
  /** The extension whose surface is currently open (for the pressed highlight), or null. */
  activeExtensionId: string | null;
  /** Fired when a toolbar icon is clicked / double-clicked; the host resolves it to a surface. The
   *  `anchor` is the clicked icon's rect, used to position a native popup under it. */
  onExtensionAction: (id: string, trigger: 'click' | 'doubleClick', anchor?: ContentBounds) => void;
}

const NAV_BTN =
  'flex h-8 w-8 items-center justify-center rounded-md text-text-secondary ' +
  'hover:bg-surface-overlay hover:text-text-primary transition-colors ' +
  'disabled:opacity-40 disabled:hover:bg-transparent disabled:cursor-default ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus';

/**
 * A pinned extension icon. When the extension binds a double-click action, a single click is deferred
 * briefly to tell the two apart (Chrome-style); otherwise it fires immediately.
 */
function ExtensionIconButton({
  ext,
  label,
  active,
  onAction,
}: {
  ext: ExtensionDef;
  label: string;
  active: boolean;
  onAction: (id: string, trigger: 'click' | 'doubleClick', anchor?: ContentBounds) => void;
}) {
  const timer = useRef<number | null>(null);
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const hasDouble = ext.manifest.actions.doubleClick !== undefined;

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  function anchor(): ContentBounds | undefined {
    const el = btnRef.current;
    if (el === null) return undefined;
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  }

  function handleClick(): void {
    if (!hasDouble) {
      onAction(ext.id, 'click', anchor());
      return;
    }
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
      onAction(ext.id, 'doubleClick', anchor());
      return;
    }
    timer.current = window.setTimeout(() => {
      timer.current = null;
      onAction(ext.id, 'click', anchor());
    }, DOUBLE_CLICK_MS);
  }

  return (
    <button
      ref={btnRef}
      type="button"
      aria-label={label}
      aria-pressed={active}
      title={label}
      onClick={handleClick}
      className={cn(NAV_BTN, active && 'bg-surface-overlay text-text-primary')}
    >
      {ext.icon}
    </button>
  );
}

export function Toolbar({
  t,
  locale,
  currentUrl,
  canGoBack,
  canGoForward,
  extensions,
  activeExtensionId,
  onExtensionAction,
}: ToolbarProps) {
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

      <Omnibox
        className="flex-1"
        currentUrl={currentUrl}
        placeholder={t.browser.omniboxPlaceholder}
        onNavigate={(input) => window.tepegoz.navigateTab(input)}
      />

      {/* Enabled extensions, pinned as icons to the right of the address bar (Chrome-style). */}
      {extensions.length <= MAX_INLINE_EXTENSIONS &&
        extensions.map((ext) => (
          <ExtensionIconButton
            key={ext.id}
            ext={ext}
            label={extensionLabel(ext.manifest, locale).name}
            active={activeExtensionId === ext.id}
            onAction={onExtensionAction}
          />
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
