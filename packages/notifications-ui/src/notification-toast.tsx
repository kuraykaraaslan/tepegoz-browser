import { useEffect, useRef } from 'react';
import { cn } from '@tepegoz/ui';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faXmark } from '@fortawesome/free-solid-svg-icons';
import { useT } from '@tepegoz/i18n/react';
import type { AppNotification, NotificationAction } from '@tepegoz/shared-types/notifications';
import { notificationsUiDict } from './i18n';
import { KIND_VISUALS } from './kind-visuals';

/** Auto-dismiss delay (ms) for a toast unless the host overrides it. */
const DEFAULT_DURATION = 6000;

export interface ToastStackProps {
  /** Transient toasts, oldest-first; the host caps the list and removes on dismiss. */
  toasts: AppNotification[];
  onDismiss: (id: string) => void;
  /** Invoked when the user activates one of a toast's `actions`. */
  onAction?: (item: AppNotification, action: NotificationAction) => void;
  /** Auto-dismiss delay per toast (ms). */
  durationMs?: number;
}

/**
 * `@tepegoz/notifications-ui` — a bottom-right stack of transient toasts (AlertBanner-styled). Each auto
 * -dismisses after `durationMs`; the host owns the list (append on push, remove on dismiss). Purely
 * presentational — no bridge dependency.
 */
export function ToastStack({
  toasts,
  onDismiss,
  onAction,
  durationMs = DEFAULT_DURATION,
}: ToastStackProps) {
  if (toasts.length === 0) return null;
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2">
      {toasts.map((toast) => (
        <Toast
          key={toast.id}
          toast={toast}
          onDismiss={onDismiss}
          onAction={onAction}
          durationMs={durationMs}
        />
      ))}
    </div>
  );
}

function Toast({
  toast,
  onDismiss,
  onAction,
  durationMs,
}: {
  toast: AppNotification;
  onDismiss: (id: string) => void;
  onAction: ((item: AppNotification, action: NotificationAction) => void) | undefined;
  durationMs: number;
}) {
  const t = useT(notificationsUiDict);
  const visual = KIND_VISUALS[toast.kind] ?? KIND_VISUALS.info;
  // Keep the latest onDismiss in a ref so re-renders don't reset the auto-dismiss timer.
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  useEffect(() => {
    const timer = setTimeout(() => onDismissRef.current(toast.id), durationMs);
    return () => clearTimeout(timer);
  }, [toast.id, durationMs]);

  return (
    <div
      role="status"
      className={cn(
        'pointer-events-auto flex items-start gap-3 rounded-lg border p-3 shadow-lg',
        visual.container,
      )}
    >
      <span aria-hidden="true" className="mt-0.5 shrink-0">
        {visual.icon}
      </span>
      <div className="min-w-0 flex-1 text-sm">
        <p className="font-semibold">{toast.title}</p>
        {toast.body.length > 0 && (
          <p className="mt-0.5 whitespace-pre-wrap break-words">{toast.body}</p>
        )}
        {toast.actions !== undefined && toast.actions.length > 0 && onAction !== undefined && (
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {toast.actions.map((action) => (
              <button
                key={action.id}
                type="button"
                onClick={() => onAction(toast, action)}
                className="rounded-md border border-current/30 px-2 py-0.5 text-xs font-medium transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
              >
                {action.label}
              </button>
            ))}
          </div>
        )}
      </div>
      <button
        type="button"
        aria-label={t.dismiss}
        title={t.dismiss}
        onClick={() => onDismiss(toast.id)}
        className="shrink-0 rounded p-0.5 transition-opacity hover:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
      >
        <FontAwesomeIcon icon={faXmark} className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
}
