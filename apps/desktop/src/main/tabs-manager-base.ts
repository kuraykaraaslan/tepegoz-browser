import { randomUUID } from 'node:crypto';
import { BrowserWindow, type WebContents } from 'electron';
import { Logger } from '@tepegoz/libs';
import { EventJournal, SessionStore } from '@tepegoz/persistence';
import { getDb } from './db/database.electron';
import { WindowTabs } from './tabs';
import { navigationObservers, type NavigationObserver } from './tabs-shared';

/**
 * Registry + session-wide concerns of the static `TabManager` facade, split out of `tabs.ts` (ADR-0010
 * 250-line cap): the window↔`WindowTabs` map, sender/focused-window resolution, the navigation-observer
 * subscription and the session snapshot persist. The many thin per-window delegates live in the
 * `TabManager` subclass (`./tabs-manager`) that this class backs.
 */
export class TabManagerBase {
  private static readonly registry = new Map<BrowserWindow, WindowTabs>();
  private static lastFocusedWin: BrowserWindow | null = null;
  private static lastPersistedSessionJson: string | null = null;

  // ── Registry ─────────────────────────────────────────────────────────────────────────────────

  /** Create + register a `WindowTabs` for a freshly-created chrome window. Idempotent per window. */
  static register(win: BrowserWindow): WindowTabs {
    const existing = TabManagerBase.registry.get(win);
    if (existing !== undefined) return existing;
    const wt = new WindowTabs(win);
    TabManagerBase.registry.set(win, wt);
    TabManagerBase.lastFocusedWin = win;
    win.on('focus', () => {
      TabManagerBase.lastFocusedWin = win;
    });
    return wt;
  }

  /** Persist + tear down a window's tabs when it closes. */
  static unregister(win: BrowserWindow): void {
    const wt = TabManagerBase.registry.get(win);
    if (wt === undefined) return;
    wt.dispose();
    TabManagerBase.registry.delete(win);
    if (TabManagerBase.lastFocusedWin === win) TabManagerBase.lastFocusedWin = null;
  }

  /** The `WindowTabs` for a specific window (undefined if it isn't a registered chrome window). */
  static forWindow(win: BrowserWindow | null): WindowTabs | undefined {
    return win !== null ? TabManagerBase.registry.get(win) : undefined;
  }

  /** The `WindowTabs` owning the chrome webContents that sent an IPC message. */
  static forSender(wc: WebContents): WindowTabs | undefined {
    return TabManagerBase.forWindow(BrowserWindow.fromWebContents(wc));
  }

  /**
   * Resolve the tab manager for a window that sent a tab IPC message. Popup surfaces (main menu, page
   * context menu) are child windows, so walk the `parent` chain to reach the owning browser window;
   * fall back to the focused window for anything unattached. This is the routing seam every tab IPC
   * handler uses so actions land in the RIGHT window (multi-window), while menu popups still work.
   */
  static forSenderWindow(win: BrowserWindow | null): WindowTabs | undefined {
    let w: BrowserWindow | null = win;
    while (w !== null && !w.isDestroyed()) {
      const wt = TabManagerBase.registry.get(w);
      if (wt !== undefined) return wt;
      w = w.getParentWindow();
    }
    return TabManagerBase.focused();
  }

  /** The focused (or last-focused, or any) window's tabs — the target for agent / menu / host code that
   *  means "the current browser". Undefined only when no chrome window exists. */
  static focused(): WindowTabs | undefined {
    const last = TabManagerBase.lastFocusedWin;
    if (last !== null && !last.isDestroyed()) {
      const wt = TabManagerBase.registry.get(last);
      if (wt !== undefined) return wt;
    }
    for (const wt of TabManagerBase.registry.values()) {
      if (!wt.window.isDestroyed()) return wt;
    }
    return undefined;
  }

  /** The focused chrome window itself (toast / cursor / permission target), or null when none. */
  static focusedWindow(): BrowserWindow | null {
    return TabManagerBase.focused()?.window ?? null;
  }

  /** Every registered window's tabs (broadcast operations, session persist). */
  static all(): WindowTabs[] {
    return [...TabManagerBase.registry.values()];
  }

  // ── Session-wide (shared) ──────────────────────────────────────────────────────────────────────

  /** Register a callback invoked after each committed top-level page load, in ANY window. Returns an
   *  unsubscribe fn. */
  static onNavigation(fn: NavigationObserver): () => void {
    navigationObservers.add(fn);
    return () => { navigationObservers.delete(fn); };
  }

  /** Apply a resolved User-Agent to every open web tab across all windows and reload. */
  static applyUserAgent(ua: string): void {
    for (const wt of TabManagerBase.all()) wt.applyUserAgent(ua);
  }

  /** Persist every window's session snapshot immediately (called on quit + window close, before
   *  dispose). Each registered window contributes one entry; windows with no restorable web tabs are
   *  dropped so an empty/internal-only window doesn't clutter the restore. */
  static persistNow(): void {
    const db = getDb();
    if (db === null) return;
    const windows = TabManagerBase.all()
      .map((wt) => wt.snapshot())
      .filter((w) => w.tabs.length > 0);
    const snapshot = { version: 3 as const, windows };
    const serialized = JSON.stringify(snapshot);
    if (serialized === TabManagerBase.lastPersistedSessionJson) return;
    try {
      SessionStore.save(db, snapshot);
      TabManagerBase.lastPersistedSessionJson = serialized;
    } catch (err) {
      Logger.warn('Failed to persist session', { err: String(err) });
      return;
    }
    try {
      EventJournal.append(db, {
        id: randomUUID(),
        type: 'SessionSnapshotWritten',
        ts: Date.now(),
        actor: 'system',
        correlationId: 'session-restore',
        redacted: true,
        payload: {
          version: 3,
          windowCount: windows.length,
          tabCount: windows.reduce((sum, w) => sum + w.tabs.length, 0),
          groupCount: windows.reduce((sum, w) => sum + w.groups.length, 0),
          activeWindowCount: windows.filter((w) => w.activeIndex >= 0).length,
        },
      });
    } catch (err) {
      Logger.warn('Failed to append session snapshot journal event', { err: String(err) });
    }
  }
}
