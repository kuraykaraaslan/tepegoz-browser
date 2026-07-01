'use client';
import { useEffect } from 'react';
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
  size?: 'sm' | 'md';
  /** When false, clicking the backdrop does NOT close (for blocking confirmations). Default true. */
  closeOnBackdrop?: boolean;
  children?: React.ReactNode;
  className?: string;
};

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
  size = 'sm',
  closeOnBackdrop = true,
  children,
  className,
}: ModalProps) {
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

  if (!open) return null;

  return (
    <div
      className="absolute inset-0 z-10 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel ?? title}
      onClick={closeOnBackdrop ? onClose : undefined}
    >
      <div
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
