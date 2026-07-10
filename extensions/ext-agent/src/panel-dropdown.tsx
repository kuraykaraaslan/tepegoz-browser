import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@tepegoz/ui';
import { ChevronDown } from './panel-icons';

/**
 * Generic trigger + FIXED-position popover dropdown, used by the Agent panel for its model/autonomy/
 * effort pickers. Fully self-contained (no dependency on `AgentPanel`'s own state).
 * Extracted from `panel.tsx` (ADR-0010 file-size split).
 */
export function Dropdown({
  trigger,
  direction = 'down',
  align = 'left',
  className,
  triggerClassName,
  menuClassName = 'min-w-[11rem] max-w-[16rem]',
  showChevron = true,
  ariaLabel,
  title,
  children,
}: {
  trigger: ReactNode; direction?: 'down' | 'up'; align?: 'left' | 'right';
  className?: string; triggerClassName?: string; menuClassName?: string; showChevron?: boolean;
  ariaLabel?: string; title?: string; children: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<CSSProperties>({});

  const place = useCallback((): void => {
    const el = triggerRef.current;
    if (el === null) return;
    const r = el.getBoundingClientRect();
    const next: CSSProperties = { position: 'fixed', zIndex: 50 };
    if (direction === 'up') next.bottom = window.innerHeight - r.top + 4;
    else next.top = r.bottom + 4;
    if (align === 'right') next.right = window.innerWidth - r.right;
    else next.left = r.left;
    setPos(next);
  }, [direction, align]);

  useLayoutEffect(() => {
    if (!open) return undefined;
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open, place]);

  useEffect(() => {
    if (!open) return undefined;
    function onDoc(e: MouseEvent): void {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) === true) return;
      if (menuRef.current?.contains(t) === true) return;
      setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => { document.removeEventListener('mousedown', onDoc); };
  }, [open]);

  return (
    <div className={cn('relative', className)}>
      <button
        ref={triggerRef}
        type="button"
        aria-label={ariaLabel}
        title={title}
        onClick={() => { setOpen((v) => !v); }}
        className={cn(
          'flex items-center gap-1 rounded-md px-2 py-1 text-sm text-text-primary hover:bg-surface-overlay focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus',
          triggerClassName,
        )}
      >
        {trigger}
        {showChevron && <ChevronDown className="h-3 w-3 text-text-secondary" />}
      </button>
      {open && createPortal(
        <div ref={menuRef} style={pos} className={cn('rounded-lg border border-border bg-surface-raised p-1 shadow-lg', menuClassName)}>
          {children(() => setOpen(false))}
        </div>,
        document.body,
      )}
    </div>
  );
}
