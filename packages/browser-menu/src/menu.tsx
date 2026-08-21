import { useEffect, useRef, type KeyboardEvent } from 'react';
import { cn, Icon } from '@tepegoz/ui';
import { useT } from '@tepegoz/i18n/react';
import { browserMenuDict } from './i18n';
import type { MenuAction, MenuItem } from './menu.types';

/** Host hooks for submenu ("flyout") parents — see `MenuItem.flyout`. The host opens/closes whatever it
 *  wants (this app opens a separate native window to the left of the menu). */
export interface MenuFlyout {
  /** A flyout parent row was hovered/focused; `rect` is the row's viewport rect (for positioning). */
  onOpen?: (id: string, rect: DOMRect) => void;
  /** The pointer moved onto a non-flyout row → close any open flyout. */
  onClose?: () => void;
}

export interface MenuProps {
  items: MenuItem[];
  /** Localized accessible name for the menu container. */
  ariaLabel: string;
  className?: string;
  /** Focus the first enabled item on mount (native popup-window use). */
  autoFocus?: boolean;
  /** Submenu open/close hooks (only needed when the model has `flyout` rows). */
  flyout?: MenuFlyout;
}

/**
 * `@tepegoz/browser-menu` — a reusable, presentational menu surface (KUIreact styling). Renders a
 * generic `MenuItem[]` model with keyboard navigation (Up/Down/Home/End; Enter/Space activate),
 * disabled placeholder rows (greyed + skipped), separators, a header row, an inline zoom control row,
 * grouped icon-button rows (`actions`), and submenu parents (`flyout`) whose open/close the HOST drives
 * via `flyout` (the app opens a separate native window). Actions + content copy are injected via the
 * model so it stays reusable. It does NOT own its host window or top-level Escape/dismissal.
 */
export function Menu({ items, ariaLabel, className, autoFocus, flyout }: MenuProps) {
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
        <MenuRow key={rowKey(item, i)} item={item} flyout={flyout} />
      ))}
    </div>
  );
}

/** Stable key for a row (separators have no id). */
function rowKey(item: MenuItem, i: number): string {
  return item.kind === 'separator' ? `sep-${i}` : item.id;
}

/** All enabled, focusable menu items (disabled buttons and the zoom +/− controls are excluded). */
function menuItems(root: HTMLDivElement | null): HTMLButtonElement[] {
  if (root === null) return [];
  return Array.from(root.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not([disabled])'));
}

/** Shared row button classes (plain items + flyout parents). */
function itemClass(danger?: boolean, disabled?: boolean): string {
  return cn(
    'flex w-full items-center gap-3 px-3 py-2 text-left transition-colors',
    'focus:outline-none focus:bg-surface-overlay',
    danger === true ? 'text-error hover:bg-error-subtle' : 'hover:bg-surface-overlay',
    disabled === true && 'cursor-not-allowed opacity-50 hover:bg-transparent',
  );
}

function MenuRow({ item, flyout }: { item: MenuItem; flyout?: MenuFlyout | undefined }) {
  if (item.kind === 'separator') {
    return <div role="separator" className="my-1 border-t border-border" />;
  }
  if (item.kind === 'header') {
    return <div className="mb-1 border-b border-border px-3 py-2">{item.content}</div>;
  }
  if (item.kind === 'label') {
    return (
      <div className="px-3 pb-1 pt-2 text-xs font-semibold text-text-secondary">{item.text}</div>
    );
  }
  if (item.kind === 'zoom') {
    return <ZoomRow item={item} />;
  }
  if (item.kind === 'actions') {
    return <ActionsRow items={item.items} flyout={flyout} />;
  }
  if (item.flyout === true) {
    const open = (el: HTMLButtonElement): void =>
      flyout?.onOpen?.(item.id, el.getBoundingClientRect());
    return (
      <button
        type="button"
        role="menuitem"
        aria-haspopup="menu"
        disabled={item.disabled}
        aria-disabled={item.disabled}
        onMouseEnter={(e) => open(e.currentTarget)}
        onFocus={(e) => open(e.currentTarget)}
        onClick={(e) => open(e.currentTarget)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight' || e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            open(e.currentTarget);
          }
        }}
        className={itemClass(item.danger, item.disabled)}
      >
        {item.icon !== undefined && (
          <span
            aria-hidden="true"
            className="flex h-4 w-4 items-center justify-center text-text-secondary"
          >
            {item.icon}
          </span>
        )}
        <span className="min-w-0 flex-1 truncate">{item.label}</span>
        <Icon name="chevronRight" className="h-3.5 w-3.5 shrink-0 text-text-secondary" />
      </button>
    );
  }
  return (
    <button
      type="button"
      role="menuitem"
      disabled={item.disabled}
      aria-disabled={item.disabled}
      onMouseEnter={() => flyout?.onClose?.()}
      onClick={item.onSelect}
      className={itemClass(item.danger, item.disabled)}
    >
      {item.icon !== undefined && (
        <span
          aria-hidden="true"
          className="flex h-4 w-4 items-center justify-center text-text-secondary"
        >
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

function ActionsRow({ items, flyout }: { items: MenuAction[]; flyout?: MenuFlyout | undefined }) {
  return (
    <div
      role="group"
      className="grid auto-cols-fr grid-flow-col gap-1 px-2 py-1"
      onMouseEnter={() => flyout?.onClose?.()}
    >
      {items.map((a) => (
        <button
          key={a.id}
          type="button"
          role="menuitem"
          aria-label={a.label}
          title={a.label}
          disabled={a.disabled}
          aria-disabled={a.disabled}
          onClick={a.onSelect}
          className={cn(
            'flex flex-col items-center gap-1 rounded-md px-1 py-2 transition-colors',
            'focus:outline-none focus:bg-surface-overlay',
            a.danger === true
              ? 'text-error hover:bg-error-subtle'
              : 'text-text-secondary hover:bg-surface-overlay hover:text-text-primary',
            a.disabled === true &&
              'cursor-not-allowed opacity-50 hover:bg-transparent hover:text-text-secondary',
          )}
        >
          <span aria-hidden="true" className="flex h-4 w-4 items-center justify-center">
            {a.icon}
          </span>
          {a.caption !== undefined && (
            <span className="max-w-full truncate text-[10px] leading-tight">{a.caption}</span>
          )}
        </button>
      ))}
    </div>
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
        <button
          type="button"
          aria-label={t.zoom.zoomOut}
          disabled={item.disabled}
          onClick={item.onZoomOut}
          className={btn}
        >
          −
        </button>
        <button
          type="button"
          aria-label={t.zoom.reset}
          disabled={item.disabled}
          onClick={item.onReset}
          className={cn(
            'w-12 text-center text-xs tabular-nums text-text-secondary',
            item.disabled === true && 'cursor-not-allowed opacity-50',
          )}
        >
          {item.value}%
        </button>
        <button
          type="button"
          aria-label={t.zoom.zoomIn}
          disabled={item.disabled}
          onClick={item.onZoomIn}
          className={btn}
        >
          +
        </button>
      </div>
    </div>
  );
}
