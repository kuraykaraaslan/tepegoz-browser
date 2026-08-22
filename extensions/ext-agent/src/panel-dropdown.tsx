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
import { placeMenu, PANEL_BOUNDS_ATTR, type Rect } from './panel-dropdown-place';

/** Style for the first (measuring) frame: laid out at its natural width, off-anchor and invisible, so
 *  `offsetWidth` can be read before the real placement is committed — no visible jump. */
const MEASURING: CSSProperties = {
  position: 'fixed',
  top: 0,
  left: 0,
  visibility: 'hidden',
  zIndex: 50,
};

/**
 * Generic trigger + FIXED-position popover dropdown, used by the Agent panel for its model/autonomy/
 * effort pickers. Fully self-contained (no dependency on `AgentPanel`'s own state).
 * Extracted from `panel.tsx` (ADR-0010 file-size split).
 *
 * The menu is portalled to `document.body` and clamped to the panel's rect — the browsed page is a
 * native view painted above all chrome DOM, so a menu that overflows the panel sideways vanishes behind
 * it rather than over it. Geometry lives in `placeMenu` (pure, unit-tested).
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
  testId,
  children,
}: {
  trigger: ReactNode;
  direction?: 'down' | 'up';
  align?: 'left' | 'right';
  className?: string;
  triggerClassName?: string;
  menuClassName?: string;
  showChevron?: boolean;
  ariaLabel?: string;
  title?: string;
  testId?: string;
  children: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  // The menu's NATURAL width, measured on the first (invisible) frame while it is still unconstrained.
  // Latched, because every later frame is capped by `maxWidth` and would re-measure the capped box.
  const naturalWidthRef = useRef(0);
  // `null` until the first placement lands — the menu renders invisible until then (see MEASURING).
  const [pos, setPos] = useState<CSSProperties | null>(null);

  const place = useCallback((): void => {
    const el = triggerRef.current;
    if (el === null) return;
    const menu = menuRef.current;
    if (menu !== null && naturalWidthRef.current === 0) naturalWidthRef.current = menu.offsetWidth;
    // The panel the menu belongs to; its rect is the only region chrome may paint in, because the
    // browsed page beside it is a native view that covers everything else.
    const host = el.closest(`[${PANEL_BOUNDS_ATTR}]`);
    const p = placeMenu({
      trigger: toRect(el.getBoundingClientRect()),
      bounds: host === null ? null : toRect(host.getBoundingClientRect()),
      viewport: { width: window.innerWidth, height: window.innerHeight },
      menuWidth: naturalWidthRef.current,
      direction,
      align,
    });
    setPos({ position: 'fixed', zIndex: 50, ...p });
  }, [direction, align]);

  useLayoutEffect(() => {
    if (!open) {
      naturalWidthRef.current = 0;
      setPos(null);
      return undefined;
    }
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
    return () => {
      document.removeEventListener('mousedown', onDoc);
    };
  }, [open]);

  return (
    <div className={cn('relative', className)}>
      <button
        ref={triggerRef}
        type="button"
        aria-label={ariaLabel}
        title={title}
        onClick={() => {
          setOpen((v) => !v);
        }}
        className={cn(
          'flex items-center gap-1 rounded-md px-2 py-1 text-sm text-text-primary hover:bg-surface-overlay focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus',
          triggerClassName,
        )}
      >
        {trigger}
        {showChevron && <ChevronDown className="h-3 w-3 text-text-secondary" />}
      </button>
      {open &&
        createPortal(
          <div
            ref={menuRef}
            data-testid={testId}
            style={pos ?? MEASURING}
            className={cn(
              'rounded-lg border border-border bg-surface-raised p-1 shadow-lg',
              menuClassName,
            )}
          >
            {children(() => setOpen(false))}
          </div>,
          document.body,
        )}
    </div>
  );
}

/** `DOMRect` → the plain edge rect `placeMenu` takes (it must stay free of DOM types to be testable). */
function toRect(r: DOMRect): Rect {
  return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
}
