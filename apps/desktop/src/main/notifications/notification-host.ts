import { BrowserWindow, Notification } from 'electron';
import { Logger } from '@tepegoz/libs';
import NotificationStore, {
  NotificationInputSchema,
  toNotification,
  type NotificationDraft,
} from '@tepegoz/notifications';
import { IpcChannels, type AppNotification } from '@tepegoz/desktop-ipc';
import PreferenceStore from '@tepegoz/preferences';

/**
 * Main-process owner of the notification center (mirrors the `journalHost` seam). Holds the singleton
 * `NotificationStore`, broadcasts its state to every app chrome window, and routes each notification
 * across the delivery surfaces the SOURCE chose (`channels`): the center (persisted history), a
 * transient toast in the main window, and/or a native OS notification. Generalizes the one-off handoff
 * notification that used to live inline in `ipc.ts`.
 */
let seq = 0;
let mainWindow: BrowserWindow | null = null;
let wired = false;

/** Broadcast the center snapshot to every app chrome window (main + open popups). Browsed pages are
 *  WebContentsViews, not BrowserWindows, so they are never reached. */
function broadcastState(): void {
  const state = NotificationStore.state();
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(IpcChannels.notificationsState, state);
  }
}

export default class NotificationHost {
  /** Wire the store→renderer broadcast and record the main window (toast target). Idempotent. */
  static attach(win: BrowserWindow): void {
    mainWindow = win;
    if (!wired) {
      NotificationStore.subscribe(broadcastState);
      wired = true;
    }
  }

  /**
   * Validate + deliver a notification across the channels the source chose. The center (history) is
   * always recorded; the intrusive surfaces (toast + native OS) are suppressed when the user has turned
   * notifications off. Returns the stored item, or null if the input failed validation.
   */
  static push(draft: NotificationDraft): AppNotification | null {
    const parsed = NotificationInputSchema.safeParse(draft);
    if (!parsed.success) {
      Logger.warn('Ignored notification: invalid payload');
      return null;
    }
    const input = parsed.data;
    seq += 1;
    const item = toNotification(input, `ntf-${String(seq)}`, Date.now());
    const enabled = PreferenceStore.getAll().notificationsEnabled;

    if (input.channels.includes('center')) NotificationStore.add(item);

    const toMain = mainWindow !== null && !mainWindow.isDestroyed();
    if (enabled && input.channels.includes('toast') && toMain) {
      mainWindow?.webContents.send(IpcChannels.notificationsToast, item);
    }
    if (enabled && input.channels.includes('native') && Notification.isSupported()) {
      new Notification({ title: item.title, body: item.body }).show();
    }
    return item;
  }
}
