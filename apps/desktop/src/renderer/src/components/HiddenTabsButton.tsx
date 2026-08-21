import { cn, Icon } from '@tepegoz/ui';

export interface HiddenTabsButtonProps {
  /** How many tabs are currently hidden (the button is not rendered when this is 0). */
  count: number;
  /** Accessible / tooltip label — the localized "Hidden tabs". */
  label: string;
}

/**
 * Caption-row control (left of the window controls) shown only while one or more tabs are hidden. It
 * opens a NATIVE menu of the hidden tabs (see hidden-tabs-menu.ts) — native, like the tab context menu,
 * so it floats above the live page's WebContentsView instead of being occluded by it. The count reads
 * off the live tab state; the button disappears once the last hidden tab is unhidden.
 */
export function HiddenTabsButton({ count, label }: HiddenTabsButtonProps) {
  if (count <= 0) return null;
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-haspopup="menu"
      onClick={() => window.tepegoz.showHiddenTabsMenu()}
      className={cn(
        'app-no-drag flex h-8 items-center gap-1.5 self-center rounded-md px-2 transition-colors',
        'text-text-secondary hover:bg-surface-overlay hover:text-text-primary',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus',
      )}
    >
      <Icon name="eyeSlash" />
      <span className="text-xs font-semibold tabular-nums leading-none">
        {count > 99 ? '99+' : count}
      </span>
    </button>
  );
}
