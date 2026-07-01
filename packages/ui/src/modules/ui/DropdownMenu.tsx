'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '../../libs/utils/cn';

/**
 * Forked from KUIreact `modules/ui/DropdownMenu.tsx` (1.0.1). Transforms vs upstream (see _FORK.md):
 *  - `@/libs/...` → relative import; `React.ReactNode` → named `ReactNode` (this fork avoids the
 *    React default import under verbatimModuleSyntax, matching the other atoms).
 *  - a11y patch: the trigger is a real <button> (upstream used a non-focusable <div onClick>, which
 *    is not keyboard-operable — WCAG 2.1.1) with `triggerClassName` / `triggerAriaLabel` passthrough.
 *  - feature patch: items gain an optional right-aligned `shortcut` accelerator hint.
 */
export type DropdownItem =
  | {
      type?: 'item';
      label: string;
      icon?: ReactNode;
      shortcut?: string;
      onClick?: () => void;
      danger?: boolean;
      disabled?: boolean;
    }
  | { type: 'separator' };

export function DropdownMenu({
  trigger,
  items,
  header,
  align = 'left',
  className,
  triggerClassName,
  triggerAriaLabel,
  onOpenChange,
}: {
  trigger: ReactNode;
  items: DropdownItem[];
  header?: ReactNode;
  align?: 'left' | 'right';
  className?: string;
  triggerClassName?: string;
  triggerAriaLabel?: string;
  /** Notified whenever the panel opens/closes (e.g. to lift the menu above an overlaid native view). */
  onOpenChange?: (open: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    onOpenChange?.(open);
  }, [open, onOpenChange]);

  useEffect(() => {
    if (!open) return;
    function onOutside(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onOutside);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onOutside);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={containerRef} className={cn('relative inline-block', className)}>
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={triggerAriaLabel}
        className={triggerClassName}
      >
        {trigger}
      </button>
      {open && (
        <div
          role="menu"
          className={cn(
            'absolute z-[60] mt-1 min-w-[13rem] rounded-lg border border-border bg-surface-raised shadow-lg py-1',
            align === 'right' ? 'right-0' : 'left-0'
          )}
        >
          {header && <div className="border-b border-border mb-1">{header}</div>}
          {items.map((item, i) => {
            if (item.type === 'separator') {
              return <div key={i} role="separator" className="my-1 border-t border-border" />;
            }
            return (
              <button
                key={i}
                role="menuitem"
                type="button"
                disabled={item.disabled}
                onClick={() => {
                  item.onClick?.();
                  setOpen(false);
                }}
                className={cn(
                  'flex w-full items-center gap-3 px-3 py-2 text-sm text-left transition-colors',
                  'focus-visible:outline-none focus-visible:bg-surface-overlay',
                  item.danger
                    ? 'text-error hover:bg-error-subtle'
                    : 'text-text-primary hover:bg-surface-overlay',
                  item.disabled && 'opacity-50 cursor-not-allowed'
                )}
              >
                {item.icon && (
                  <span aria-hidden="true" className="flex h-4 w-4 shrink-0 items-center justify-center text-text-secondary">
                    {item.icon}
                  </span>
                )}
                <span className="flex-1 truncate">{item.label}</span>
                {item.shortcut && (
                  <span className="shrink-0 pl-4 text-xs text-text-disabled">{item.shortcut}</span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
