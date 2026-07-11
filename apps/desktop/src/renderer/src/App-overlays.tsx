import { pick, type Locale } from '@tepegoz/i18n';
import { Modal } from '@tepegoz/ui';
import { NotificationPermissionPrompt, ToastStack } from '@tepegoz/notifications-ui';
import type { AppNotification, NotificationPermissionRequest } from '@tepegoz/desktop-ipc';
import { browserDict } from '../../i18n';
import { runNotificationAction } from './lib/notification-actions';
import type { BookmarksBarResult } from './app-bookmarks';

export interface AppOverlaysProps {
  locale: Locale;
  toasts: AppNotification[];
  dismissToast: (id: string) => void;
  permReq: NotificationPermissionRequest | null;
  answerPermission: (allow: boolean, remember: boolean) => void;
  bookmarks: BookmarksBarResult;
}

/**
 * The App shell's floating overlays: the transient toast stack, the per-site Web Notification consent
 * prompt, and the bookmark folder "open all" confirmation. Split out of `App.tsx` (ADR-0010 250-line
 * cap). Renders above its own `I18nProvider`, so it self-resolves strings with `pick(dict, locale)`.
 */
export function AppOverlays({
  locale,
  toasts,
  dismissToast,
  permReq,
  answerPermission,
  bookmarks,
}: AppOverlaysProps) {
  const browserT = pick(browserDict, locale);

  return (
    <>
      {/* Transient toast overlay (channel `toast`); native OS notifications cover the over-page case. */}
      <ToastStack
        toasts={toasts}
        onDismiss={dismissToast}
        onAction={(item, action) => {
          runNotificationAction(item, action);
          dismissToast(item.id);
        }}
      />
      {/* Per-site Web Notification consent prompt (blocking: no backdrop dismiss — the site awaits an answer). */}
      <Modal
        open={permReq !== null}
        onClose={() => answerPermission(false, false)}
        ariaLabel={permReq?.origin ?? ''}
        closeOnBackdrop={false}
      >
        {permReq !== null && (
          <NotificationPermissionPrompt
            origin={permReq.origin}
            capability={permReq.capability}
            onDecision={answerPermission}
          />
        )}
      </Modal>
      {/* "Open all" confirmation for a large folder. */}
      <Modal
        open={bookmarks.openAllUrls !== null}
        onClose={() => bookmarks.setOpenAllUrls(null)}
        ariaLabel={browserT.bookmarkMenu.openAll}
      >
        {bookmarks.openAllUrls !== null && (
          <div className="flex min-w-[20rem] flex-col gap-4 p-4">
            <p className="text-sm text-text-primary">
              {browserT.openAllConfirm} ({bookmarks.openAllUrls.length})
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => bookmarks.setOpenAllUrls(null)}
                className="rounded-md px-3 py-1.5 text-sm text-text-secondary hover:bg-surface-overlay"
              >
                {browserT.cancel}
              </button>
              <button
                type="button"
                onClick={() => {
                  bookmarks.openAllUrls?.forEach((u) => window.tepegoz.createTabInBackground(u));
                  bookmarks.setOpenAllUrls(null);
                }}
                className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-fg hover:bg-primary-hover"
              >
                {browserT.bookmarkMenu.openAll}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
