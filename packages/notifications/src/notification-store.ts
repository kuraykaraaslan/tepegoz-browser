import type { AppNotification, NotificationState } from '@tepegoz/shared-types/notifications';

/** Newest-first ring cap — the center keeps at most this many items; older ones are evicted. */
const CAP = 200;

type Listener = (state: NotificationState) => void;

/**
 * `@tepegoz/notifications` — the in-app notification center's headless model. Framework-agnostic and
 * Electron-free (the main-process `NotificationHost` owns the singleton and drives IPC; toast/native
 * delivery are decided there from a notification's `channels`). Every item held here is a persisted
 * center item; `unread` counts those not yet read. Static with a `reset()` test seam, mirroring
 * `PreferenceStore` / `CapabilityRegistry`.
 */
export default class NotificationStore {
  /** Newest-first. */
  private static items: AppNotification[] = [];
  private static listeners = new Set<Listener>();

  /** Add a center item (newest-first). If it carries a `dedupeKey`, it replaces the prior match. */
  static add(item: AppNotification): void {
    if (item.dedupeKey !== undefined) {
      NotificationStore.items = NotificationStore.items.filter(
        (i) => i.dedupeKey !== item.dedupeKey,
      );
    }
    NotificationStore.items.unshift(item);
    if (NotificationStore.items.length > CAP) NotificationStore.items.length = CAP;
    NotificationStore.emit();
  }

  /** Remove one item by id (no-op if absent). */
  static dismiss(id: string): void {
    const next = NotificationStore.items.filter((i) => i.id !== id);
    if (next.length === NotificationStore.items.length) return;
    NotificationStore.items = next;
    NotificationStore.emit();
  }

  /** Clear the whole center. */
  static dismissAll(): void {
    if (NotificationStore.items.length === 0) return;
    NotificationStore.items = [];
    NotificationStore.emit();
  }

  /** Mark one item read (no-op if absent or already read). */
  static markRead(id: string): void {
    let changed = false;
    NotificationStore.items = NotificationStore.items.map((i) => {
      if (i.id === id && !i.read) {
        changed = true;
        return { ...i, read: true };
      }
      return i;
    });
    if (changed) NotificationStore.emit();
  }

  /** Mark every item read (no-op if all already read). */
  static markAllRead(): void {
    if (NotificationStore.items.every((i) => i.read)) return;
    NotificationStore.items = NotificationStore.items.map((i) =>
      i.read ? i : { ...i, read: true },
    );
    NotificationStore.emit();
  }

  /** Newest-first snapshot (defensive copy). */
  static list(): AppNotification[] {
    return NotificationStore.items.slice();
  }

  static unreadCount(): number {
    return NotificationStore.items.reduce((n, i) => (i.read ? n : n + 1), 0);
  }

  /** The renderer-facing snapshot pushed on every mutation. */
  static state(): NotificationState {
    return { items: NotificationStore.list(), unread: NotificationStore.unreadCount() };
  }

  /** Subscribe to state changes; returns an unsubscribe fn. Does not fire on subscribe. */
  static subscribe(listener: Listener): () => void {
    NotificationStore.listeners.add(listener);
    return () => {
      NotificationStore.listeners.delete(listener);
    };
  }

  /** Test seam — clears items AND listeners. */
  static reset(): void {
    NotificationStore.items = [];
    NotificationStore.listeners.clear();
  }

  private static emit(): void {
    const snapshot = NotificationStore.state();
    for (const listener of NotificationStore.listeners) listener(snapshot);
  }
}
