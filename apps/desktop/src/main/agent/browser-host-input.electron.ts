import type { WebContents } from 'electron';
import { HumanInputAdapter, type CdpSend } from '@tepegoz/human-input';
import { IpcChannels } from '@tepegoz/desktop-ipc';
import TabManager from '../tabs';
import { isParkedToTray } from '../window-parked';
import { showPageCursor, hidePageCursor, isUserControlActive } from './page-cursor.electron';
import { emitCurrentRunEvent } from './browser-host-run-scope.electron';

// --- Cursor overlay wiring ---

function sendCursorPosition(x: number, y: number, visible: boolean): void {
  // The agent acts on the focused chrome window; push the cursor overlay there.
  const win = TabManager.focusedWindow();
  if (win === null || win.isDestroyed()) return;
  const b = TabManager.getContentBounds();
  win.webContents.send(IpcChannels.cursorPosition, {
    x: x + b.x,
    y: y + b.y,
    visible,
  });
}

/** Is `wc` the tab the user is actually looking at right now? Governs the CHROME overlay only. */
function isVisibleTab(wc: WebContents): boolean {
  const active = TabManager.activeWebContents();
  return active !== null && !active.isDestroyed() && active.id === wc.id;
}

function onCursorMove(wc: WebContents, x: number, y: number): void {
  if (!wc.isDestroyed()) showPageCursor(wc, x, y);
  // The chrome-level overlay is drawn over the CONTENT AREA, so it may only follow the tab currently
  // occupying it — a background tab's cursor there would point at a page the user cannot see.
  if (isVisibleTab(wc)) sendCursorPosition(x, y, true);
}

export function onCursorHide(wc: WebContents): void {
  if (!wc.isDestroyed()) hidePageCursor(wc);
  if (isVisibleTab(wc)) sendCursorPosition(0, 0, false);
}

export function onInputAction(kind: string, detail: string): void {
  emitCurrentRunEvent('input_action', `${kind} ${detail}`);
}

/** CDP transport bound to ONE tab — never `requireWc()`, so an adapter cannot drift onto another tab. */
function cdpSendFor(wc: WebContents): CdpSend {
  return (method, params) => wc.debugger.sendCommand(method, params);
}

/**
 * Is what the agent is doing on THIS tab actually on screen? (S7 PR3)
 *
 * "Active tab" stopped meaning "visible" once tabs could be parked off-screen and windows hidden to
 * the tray while still compositing. In those states the agent pays full human-realism pacing for a
 * performance with no audience, which is the single largest avoidable chunk of wall-clock in a run.
 *
 * Now asked PER TAB rather than of the focused window: a tab being driven in the background is
 * genuinely unseen, so it drops the sleeps — while still dispatching the identical event stream (the
 * adapter drops pacing, never events). Every signal here already exists and already drives the parking
 * itself — no new IPC, and nothing the renderer can influence. Unknown states resolve to "visible", so
 * pacing is only ever dropped on a state we positively recognise as unseen.
 */
function tabIsOnScreen(wc: WebContents): boolean {
  if (!isVisibleTab(wc)) return false; // not the tab in the content area ⇒ nobody is watching it
  const win = TabManager.focusedWindow();
  if (win === null || win.isDestroyed()) return true;
  if (isParkedToTray(win) || win.isMinimized() || !win.isVisible()) return false;
  const state = TabManager.getState();
  const active = state.tabs.find((t) => t.id === state.activeId);
  return active?.hidden !== true;
}

/**
 * One {@link HumanInputAdapter} PER TAB, so every agent action goes through real gesture synthesis.
 *
 * Previously a single module-level adapter was passed only when the caller named no `tabId`, which
 * meant a tabId-targeted action silently lost humanization, cursor motion AND its `input_action`
 * narration — it teleported. Keying the adapter by tab fixes that, and is also what lets two runs
 * drive two tabs without sharing one adapter's accumulated cursor position.
 *
 * A `WeakMap` because the entry must die with the tab: keyed by the `WebContents` itself, a closed tab
 * takes its adapter with it and there is no id-keyed map to sweep.
 */
const adapters = new WeakMap<WebContents, HumanInputAdapter>();

export function adapterFor(wc: WebContents): HumanInputAdapter {
  const existing = adapters.get(wc);
  if (existing !== undefined) return existing;
  const adapter = new HumanInputAdapter(
    cdpSendFor(wc),
    (x, y) => {
      onCursorMove(wc, x, y);
    },
    onInputAction,
    isUserControlActive,
    () => tabIsOnScreen(wc),
  );
  adapters.set(wc, adapter);
  return adapter;
}
