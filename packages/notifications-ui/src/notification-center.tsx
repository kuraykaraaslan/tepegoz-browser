import { useEffect, useRef, type KeyboardEvent } from 'react';
import { cn } from '@tepegoz/ui';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCheckDouble, faTrashCan, faXmark } from '@fortawesome/free-solid-svg-icons';
import { useT } from '@tepegoz/i18n/react';
import type { AppNotification, NotificationAction } from '@tepegoz/shared-types/notifications';
import { notificationsUiDict, type NotificationsUiStrings } from './i18n';
import { KIND_VISUALS } from './kind-visuals';

export interface NotificationCenterProps {
  items: AppNotification[];
  onDismiss: (id: string) => void;
  onDismissAll: () => void;
  onMarkRead: (id: string) => void;
  onMarkAllRead: () => void;
  /** Invoked when the user activates one of a notification's `actions`. */
  onAction?: (item: AppNotification, action: NotificationAction) => void;
  /** Locale-aware relative-time formatter, supplied by the host (package stays i18n-agnostic on dates). */
  formatTime?: (ts: number) => string;
  /** Focus the first row on mount (native popup-window use). */
  autoFocus?: boolean;
}

/**
 * `@tepegoz/notifications-ui` — the presentational notification center (KUIreact styling). Renders an
 * `AppNotification[]` model with per-row dismiss + mark-read, header bulk actions, unread emphasis, and
 * Up/Down/Home/End keyboard navigation over rows (mirrors `@tepegoz/browser-menu`). All actions are
 * injected as callbacks so it stays bridge-agnostic; it does NOT own its host window or dismissal.
 */
export function NotificationCenter({
  items,
  onDismiss,
  onDismissAll,
  onMarkRead,
  onMarkAllRead,
  onAction,
  formatTime,
  autoFocus,
}: NotificationCenterProps) {
  const t = useT(notificationsUiDict);
  const listRef = useRef<HTMLUListElement>(null);
  const hasUnread = items.some((i) => !i.read);

  useEffect(() => {
    if (autoFocus) rows(listRef.current)[0]?.focus();
  }, [autoFocus]);

  function onKeyDown(e: KeyboardEvent<HTMLUListElement>): void {
    const buttons = rows(listRef.current);
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
    <div className="flex h-full w-full flex-col text-sm text-text-primary">
      <header className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2">
        <h2 className="flex-1 truncate font-semibold">{t.title}</h2>
        <button
          type="button"
          aria-label={t.markAllRead}
          title={t.markAllRead}
          disabled={!hasUnread}
          onClick={onMarkAllRead}
          className={headerBtn}
        >
          <FontAwesomeIcon icon={faCheckDouble} className="h-4 w-4" aria-hidden />
        </button>
        <button
          type="button"
          aria-label={t.clearAll}
          title={t.clearAll}
          disabled={items.length === 0}
          onClick={onDismissAll}
          className={headerBtn}
        >
          <FontAwesomeIcon icon={faTrashCan} className="h-4 w-4" aria-hidden />
        </button>
      </header>

      {items.length === 0 ? (
        <p className="flex flex-1 items-center justify-center px-4 py-8 text-center text-text-secondary">
          {t.empty}
        </p>
      ) : (
        <ul
          ref={listRef}
          aria-label={t.title}
          onKeyDown={onKeyDown}
          className="min-h-0 flex-1 overflow-auto py-1"
        >
          {items.map((item) => (
            <Row
              key={item.id}
              item={item}
              t={t}
              formatTime={formatTime}
              onMarkRead={onMarkRead}
              onDismiss={onDismiss}
              onAction={onAction}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

const headerBtn = cn(
  'flex h-7 w-7 items-center justify-center rounded-md text-text-secondary transition-colors',
  'hover:bg-surface-overlay hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus',
  'disabled:opacity-40 disabled:hover:bg-transparent disabled:cursor-default',
);

function Row({
  item,
  t,
  formatTime,
  onMarkRead,
  onDismiss,
  onAction,
}: {
  item: AppNotification;
  t: NotificationsUiStrings;
  formatTime: ((ts: number) => string) | undefined;
  onMarkRead: (id: string) => void;
  onDismiss: (id: string) => void;
  onAction: ((item: AppNotification, action: NotificationAction) => void) | undefined;
}) {
  const visual = KIND_VISUALS[item.kind] ?? KIND_VISUALS.info;
  return (
    <li
      className={cn(
        'mx-1 flex items-start gap-2 rounded-md px-2 py-2 transition-colors',
        item.read ? 'opacity-70' : 'bg-surface-overlay/40',
      )}
    >
      <span
        aria-hidden="true"
        className={cn('mt-0.5 shrink-0 rounded-md border p-1', visual.container)}
      >
        {visual.icon}
      </span>
      <div className="min-w-0 flex-1">
        {/* The title/body is a button: activating it marks the notification read. */}
        <button
          type="button"
          data-notif-row
          onClick={() => {
            if (!item.read) onMarkRead(item.id);
          }}
          className="block w-full rounded text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
        >
          <span className="flex items-center gap-2">
            {!item.read && (
              <span aria-label={t.unread} className="h-1.5 w-1.5 shrink-0 rounded-full bg-info" />
            )}
            <span className={cn('min-w-0 flex-1 truncate', !item.read && 'font-semibold')}>
              {item.title}
            </span>
            {formatTime !== undefined && (
              <span className="shrink-0 text-xs text-text-secondary">{formatTime(item.ts)}</span>
            )}
          </span>
          {item.body.length > 0 && (
            <span className="mt-0.5 block whitespace-pre-wrap break-words text-xs text-text-secondary">
              {item.body}
            </span>
          )}
        </button>
        {item.actions !== undefined && item.actions.length > 0 && onAction !== undefined && (
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {item.actions.map((action) => (
              <button
                key={action.id}
                type="button"
                onClick={() => onAction(item, action)}
                className="rounded-md border border-border px-2 py-1 text-xs font-medium text-text-primary transition-colors hover:bg-surface-overlay focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
              >
                {action.label}
              </button>
            ))}
          </div>
        )}
      </div>
      {item.dismissible !== false && (
        <button
          type="button"
          aria-label={t.dismiss}
          title={t.dismiss}
          onClick={() => onDismiss(item.id)}
          className="mt-0.5 shrink-0 rounded p-1 text-text-secondary transition-colors hover:bg-surface-overlay hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
        >
          <FontAwesomeIcon icon={faXmark} className="h-3.5 w-3.5" aria-hidden />
        </button>
      )}
    </li>
  );
}

/** All focusable notification rows (the body buttons). */
function rows(root: HTMLUListElement | null): HTMLButtonElement[] {
  if (root === null) return [];
  return Array.from(root.querySelectorAll<HTMLButtonElement>('button[data-notif-row]'));
}
