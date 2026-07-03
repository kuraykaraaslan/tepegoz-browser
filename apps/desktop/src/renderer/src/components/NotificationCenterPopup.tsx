import { useEffect, useState } from 'react';
import { resolveLocale, type Locale } from '@tepegoz/i18n';
import { I18nProvider } from '@tepegoz/i18n/react';
import { NotificationCenter } from '@tepegoz/notifications-ui';
import type { NotificationState } from '@tepegoz/desktop-ipc';
import { runNotificationAction } from '../lib/notification-actions';
import { applyTheme } from '../lib/theme';

/**
 * Standalone render target for the native notification-center popup window (loaded with
 * `?surface=notifications`). Mirrors `MainMenuPopup`: fetch prefs → apply theme + locale, Escape closes,
 * wrap in the I18nProvider. It fetches the current center snapshot and subscribes to live pushes from
 * NotificationHost, delegating every mutation back to the main process via the bridge.
 */

/** Compact locale-aware relative time ("2 min ago") for a notification's timestamp. */
function formatRelative(ts: number, locale: Locale): string {
  const diff = ts - Date.now();
  const abs = Math.abs(diff);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto', style: 'short' });
  const MIN = 60_000;
  const HOUR = 3_600_000;
  const DAY = 86_400_000;
  if (abs < MIN) return rtf.format(Math.round(diff / 1000), 'second');
  if (abs < HOUR) return rtf.format(Math.round(diff / MIN), 'minute');
  if (abs < DAY) return rtf.format(Math.round(diff / HOUR), 'hour');
  return rtf.format(Math.round(diff / DAY), 'day');
}

export function NotificationCenterPopup() {
  const [locale, setLocale] = useState<Locale>('en');
  const [state, setState] = useState<NotificationState>({ items: [], unread: 0 });

  useEffect(() => {
    void window.tepegoz.getPreferences().then(
      (p) => {
        applyTheme(p.theme, p.themeColor);
        setLocale(
          p.locale === 'en' || p.locale === 'tr' ? p.locale : resolveLocale(navigator.language),
        );
      },
      () => {
        /* bridge unavailable — fall back to defaults */
      },
    );
    void window.tepegoz.listNotifications().then(setState, () => {
      /* ignore */
    });
    const off = window.tepegoz.onNotificationsState(setState);
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') window.tepegoz.closePopup();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      off();
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  return (
    <I18nProvider locale={locale}>
      <div className="flex h-screen flex-col overflow-hidden bg-surface-base text-text-primary">
        <NotificationCenter
          items={state.items}
          onDismiss={(id) => window.tepegoz.dismissNotification(id)}
          onDismissAll={() => window.tepegoz.dismissAllNotifications()}
          onMarkRead={(id) => window.tepegoz.markNotificationRead(id)}
          onMarkAllRead={() => window.tepegoz.markAllNotificationsRead()}
          onAction={(item, action) => {
            // Navigation actions take over the main window, so close the popup after running them.
            if (runNotificationAction(item, action)) window.tepegoz.closePopup();
          }}
          formatTime={(ts) => formatRelative(ts, locale)}
          autoFocus
        />
      </div>
    </I18nProvider>
  );
}
