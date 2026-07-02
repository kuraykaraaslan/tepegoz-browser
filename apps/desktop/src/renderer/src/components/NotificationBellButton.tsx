import { useEffect, useRef, useState } from 'react';
import { cn, Icon } from '@tepegoz/ui';
import { useT } from '@tepegoz/i18n/react';
import { notificationsUiDict } from '@tepegoz/notifications-ui/i18n';

/** Estimated content height (px) of the notification center; main clamps it to the work area. */
const CENTER_HEIGHT = 520;

/**
 * The caption-row bell (left of the window controls). It opens the notification center as a NATIVE popup
 * window (see PopupWindowManager) so the panel floats above the live page and is never occluded by the
 * tab's WebContentsView — same pattern as the main-menu button. The unread badge tracks the live center
 * state pushed from main; re-clicking toggles the popup off (the main reopen-guard swallows the second
 * click, and `onPopupClosed` keeps `aria-expanded` in sync).
 */
export function NotificationBellButton() {
  const t = useT(notificationsUiDict);
  const ref = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    void window.tepegoz.listNotifications().then(
      (s) => setUnread(s.unread),
      () => {
        /* bridge unavailable — leave at 0 */
      },
    );
    const offState = window.tepegoz.onNotificationsState((s) => setUnread(s.unread));
    const offClosed = window.tepegoz.onPopupClosed((surface) => {
      if (surface === 'notifications') setOpen(false);
    });
    return () => {
      offState();
      offClosed();
    };
  }, []);

  function onClick(): void {
    const el = ref.current;
    if (el === null) return;
    if (open) {
      window.tepegoz.closePopup();
      setOpen(false);
      return;
    }
    const r = el.getBoundingClientRect();
    window.tepegoz.openPopup(
      'notifications',
      { x: r.x, y: r.y, width: r.width, height: r.height },
      { height: CENTER_HEIGHT },
    );
    setOpen(true);
  }

  const active = unread > 0;
  const badge = unread > 99 ? '99+' : String(unread);

  return (
    <button
      ref={ref}
      type="button"
      aria-label={t.title}
      aria-haspopup="dialog"
      aria-expanded={open}
      onClick={onClick}
      className={cn(
        'app-no-drag relative flex h-8 w-8 items-center justify-center self-center rounded-md transition-colors',
        'hover:bg-surface-overlay focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus',
        // Faded when there is nothing to see; strong (full-contrast) once there are unread notifications.
        active
          ? 'text-text-primary'
          : 'text-text-secondary opacity-50 hover:text-text-primary hover:opacity-100',
      )}
    >
      <Icon name="bell" />
      {active && (
        <span
          aria-hidden="true"
          className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-error px-1 text-[10px] font-semibold leading-none text-white"
        >
          {badge}
        </span>
      )}
    </button>
  );
}
