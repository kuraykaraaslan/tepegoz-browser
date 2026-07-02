'use client';
import { useEffect, useRef } from 'react';
import { cn } from '../../libs/utils/cn';

type ModalProps = {
  /** Whether the modal is shown. When false, nothing renders. */
  open: boolean;
  /** Called on backdrop click, Escape, or the (optional) close affordance. */
  onClose: () => void;
  /** Optional heading rendered at the top of the dialog. */
  title?: string;
  /** Accessible label for the dialog (falls back to `title`). */
  ariaLabel?: string;
  /** id of the element that describes the dialog body (wired to aria-describedby). */
  describedById?: string;
  size?: 'sm' | 'md';
  /** When false, clicking the backdrop does NOT close (for blocking confirmations). Default true. */
  closeOnBackdrop?: boolean;
  children?: React.ReactNode;
  className?: string;
};

/** What the focus trap considers tabbable inside the dialog. */
const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Centered dialog over a dimmed backdrop — the shared surface for extension `modal` actions and any
 * blocking confirmation. Closes on Escape and (by default) backdrop click. Positioned `absolute` so it
 * fills its nearest positioned ancestor (the app's content host), matching the chrome-overlay model.
 */
export function Modal({
  open,
  onClose,
  title,
  ariaLabel,
  describedById,
  size = 'sm',
  closeOnBackdrop = true,
  children,
  className,
}: ModalProps) {
  const dialogRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  // Modal ARIA focus contract: remember the opener, move focus INTO the dialog on open, keep Tab /
  // Shift+Tab cycling inside it, and return focus to the opener on close (WCAG 2.2 dialog pattern).
  useEffect(() => {
    if (!open) return undefined;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = dialogRef.current;
    const initial = dialog?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR) ?? dialog;
    initial?.focus();

    const onTab = (e: KeyboardEvent): void => {
      if (e.key !== 'Tab' || dialog === null) return;
      const items = [...dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)];
      const first = items.at(0);
      const last = items.at(-1);
      if (first === undefined || last === undefined) {
        e.preventDefault(); // nothing tabbable — keep focus parked on the dialog itself
        dialog.focus();
        return;
      }
      const active = document.activeElement;
      const outside = !dialog.contains(active);
      if (e.shiftKey && (active === first || outside)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || outside)) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onTab);
    return () => {
      window.removeEventListener('keydown', onTab);
      opener?.focus();
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="absolute inset-0 z-10 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel ?? title}
      aria-describedby={describedById}
      onClick={closeOnBackdrop ? onClose : undefined}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        className={cn(
          // Host-enforced size cap: width by `size`, height ≤ 85vh with the body scrolling — an
          // extension's content can never grow the dialog past these bounds.
          'flex max-h-[85vh] w-full flex-col overflow-y-auto rounded-lg border border-border bg-surface-raised p-4 shadow-xl',
          size === 'sm' ? 'max-w-sm' : 'max-w-md',
          className,
        )}
        onClick={(e) => {
          e.stopPropagation(); // clicks inside the dialog must not fall through to the backdrop
        }}
      >
        {title !== undefined && (
          <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
        )}
        {children}
      </div>
    </div>
  );
}
