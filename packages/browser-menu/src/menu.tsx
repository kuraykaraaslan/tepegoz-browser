import { useEffect, useRef, type KeyboardEvent } from 'react';
import { cn } from '@tepegoz/ui';
import { useT } from '@tepegoz/i18n/react';
import { browserMenuDict } from './i18n';
import type { MenuItem } from './menu.types';

export interface MenuProps {
  items: MenuItem[];
  /** Localized accessible name for the menu container. */
  ariaLabel: string;
  className?: string;
  /** Focus the first enabled item on mount (native popup-window use). */
  autoFocus?: boolean;
}

/**
 * `@tepegoz/browser-menu` — a reusable, presentational menu surface (KUIreact styling). Renders a
 * generic `MenuItem[]` model with keyboard navigation (Up/Down/Home/End; Enter/Space activate),
 * disabled placeholder rows (greyed + skipped), separators, a header row, and an inline zoom control
 * row. Actions + content copy are injected via the model so it stays reusable across menus. It does
 * NOT own its host container/window or Escape handling — the caller (e.g. a popup window) owns dismissal.
 */
export function Menu({ items, ariaLabel, className, autoFocus }: MenuProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (autoFocus) menuItems(ref.current)[0]?.focus();
  }, [autoFocus]);

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>): void {
    const buttons = menuItems(ref.current);
    if (buttons.length === 0) return;
    const idx = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      buttons[(idx + 1) % buttons.length]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      buttons[(idx - 1 + buttons.length) % buttons.length]?.focus();
    } else if (e.key === 'Home') {
      e.preventDefault();
      buttons[0]?.focus();
    } else if (e.key === 'End') {
      e.preventDefault();
      buttons[buttons.length - 1]?.focus();
    }
  }

  return (
    <div
      ref={ref}
      role="menu"
      aria-label={ariaLabel}
      onKeyDown={onKeyDown}
      className={cn('w-full py-1 text-sm text-text-primary', className)}
    >
      {items.map((item, i) => (
        <MenuRow key={item.kind === 'separator' ? `sep-${i}` : item.id} item={item} />
      ))}
    </div>
  );
}

/** All enabled, focusable menu items (the zoom +/− controls are not `menuitem`s, so nav skips them). */
function menuItems(root: HTMLDivElement | null): HTMLButtonElement[] {
  if (root === null) return [];
  return Array.from(root.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not([disabled])'));
}

function MenuRow({ item }: { item: MenuItem }) {
  if (item.kind === 'separator') {
    return <div role="separator" className="my-1 border-t border-border" />;
  }
  if (item.kind === 'header') {
    return <div className="mb-1 border-b border-border px-3 py-2">{item.content}</div>;
  }
  if (item.kind === 'zoom') {
    return <ZoomRow item={item} />;
  }
  return (
    <button
      type="button"
      role="menuitem"
      disabled={item.disabled}
      aria-disabled={item.disabled}
      onClick={item.onSelect}
      className={cn(
        'flex w-full items-center gap-3 px-3 py-2 text-left transition-colors',
        'focus:outline-none focus:bg-surface-overlay',
        item.danger ? 'text-error hover:bg-error-subtle' : 'hover:bg-surface-overlay',
        item.disabled === true && 'cursor-not-allowed opacity-50 hover:bg-transparent',
      )}
    >
      {item.icon !== undefined && (
        <span aria-hidden="true" className="flex h-4 w-4 items-center justify-center text-text-secondary">
          {item.icon}
        </span>
      )}
      <span className="min-w-0 flex-1 truncate">{item.label}</span>
      {item.shortcut !== undefined && (
        <span className="shrink-0 text-xs text-text-secondary">{item.shortcut}</span>
      )}
      {item.trailing}
    </button>
  );
}

function ZoomRow({ item }: { item: Extract<MenuItem, { kind: 'zoom' }> }) {
  const t = useT(browserMenuDict);
  const btn = cn(
    'flex h-6 w-6 items-center justify-center rounded-full text-text-secondary transition-colors',
    'hover:bg-surface-overlay focus:outline-none focus:bg-surface-overlay',
    item.disabled === true && 'cursor-not-allowed opacity-50 hover:bg-transparent',
  );
  return (
    <div className="flex w-full items-center gap-3 px-3 py-2">
      <span className="min-w-0 flex-1 truncate">{item.label}</span>
      <div className="flex shrink-0 items-center gap-1">
        <button type="button" aria-label={t.zoom.zoomOut} disabled={item.disabled} onClick={item.onZoomOut} className={btn}>
          −
        </button>
        <button
          type="button"
          aria-label={t.zoom.reset}
          disabled={item.disabled}
          onClick={item.onReset}
          className={cn('w-12 text-center text-xs tabular-nums text-text-secondary', item.disabled === true && 'cursor-not-allowed opacity-50')}
        >
          {item.value}%
        </button>
        <button type="button" aria-label={t.zoom.zoomIn} disabled={item.disabled} onClick={item.onZoomIn} className={btn}>
          +
        </button>
      </div>
    </div>
  );
}
