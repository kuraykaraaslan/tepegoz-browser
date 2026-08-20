import type { WebContents } from 'electron';
import { Logger } from '@tepegoz/libs';
import type { InterceptedDialog } from '@tepegoz/browser-tools';

/**
 * S3 PR4 — JS-dialog + `beforeunload` interception, so a `window.confirm`/`alert`/`prompt` or an
 * unsaved-changes prompt can never silently strand a run OR silently take a destructive path.
 *
 * SPIKE FINDING (`e2e/spike-dialog-interception.spec.ts`, all four arms green, repeated): the phase doc's
 * own risk — that an open native DevTools window conflicts with `webContents.debugger` — does NOT hold on
 * this Electron version. `debugger.attach()` succeeds with DevTools already open, opening DevTools after
 * the agent's debugger is attached neither throws nor detaches it, and the full
 * attach → `Page.enable` → `Page.javascriptDialogOpening` → `Page.handleJavaScriptDialog` flow works
 * end-to-end with DevTools open throughout. So there is no "debugger is busy" fallback case to design
 * for — `CdpDriver.ensureAttached`'s existing `AppError(409)` on any OTHER attach failure already covers
 * the rare case a tool call cannot drive the page at all, uniformly with every other such failure.
 *
 * The decision every dialog gets is a DETERMINISTIC auto-decline (`accept: false`) — never a live human
 * approve/deny UI, and never a page-principal `window.confirm`/`window.alert` override (ADR-0024
 * invariant; this is main-process/native-only). An agent must never be able to talk itself into a
 * destructive `confirm()`, and declining costs nothing for an `alert()` (it has only one button). A
 * legitimate, non-destructive `confirm()` an agent gets stuck behind is a real cost, but the alternative —
 * guessing intent from the dialog's own (page-controlled, untrusted) text with no model call allowed
 * inside an action — is not a safe default; the model is told exactly what happened via the next tool
 * result (see `interceptionNote` in `@tepegoz/browser-tools`) and can find another way, same as every
 * other refusal this phase adds (S3 PR7's widget refusal reads identically).
 *
 * `beforeunload` is handled natively (`will-prevent-unload`, no debugger involved) and ALWAYS
 * `preventDefault()`s: the navigation/close is silently cancelled rather than leaving a native OS prompt
 * up that no DOM action can dismiss (S3 PR4's own "stranding" failure mode). Scoped to tabs the agent has
 * actually acted on (installed from `ensureAttached`, exactly like the network recorder), so an ordinary
 * human browsing tab the agent never touched keeps its normal "leave site?" prompt.
 */

/** Max chars of a dialog's own message kept (page-controlled — untrusted, and only ever quoted back
 *  through `@tepegoz/browser-tools`'s own sanitizing pass). */
const MAX_MESSAGE_CHARS = 300;
/** Interceptions kept per tab. A single action window sees at most one or two; the rest is slack. */
const MAX_EVENTS = 20;

interface TabInterceptions {
  events: InterceptedDialog[];
}

const state = new WeakMap<WebContents, TabInterceptions>();
/** WebContents whose permanent listeners are already installed (guards re-attach on tab switch). */
const wired = new WeakSet<WebContents>();

function push(tab: TabInterceptions, event: InterceptedDialog): void {
  tab.events.push(event);
  if (tab.events.length > MAX_EVENTS) tab.events.splice(0, tab.events.length - MAX_EVENTS);
}

/**
 * Start intercepting dialogs + `beforeunload` on `wc`. Idempotent — calling it on every
 * `ensureAttached` is safe and intended (mirrors `attachNetworkRecorder`). Must run AFTER `Page.enable`.
 */
export function attachDialogInterceptor(wc: WebContents): void {
  if (wired.has(wc)) return;
  wired.add(wc);
  const tab: TabInterceptions = { events: [] };
  state.set(wc, tab);

  wc.debugger.on('message', (_event: unknown, method: string, params?: unknown) => {
    if (method !== 'Page.javascriptDialogOpening') return;
    const p = params as { message?: unknown; type?: unknown } | undefined;
    const message = typeof p?.message === 'string' ? p.message.slice(0, MAX_MESSAGE_CHARS) : '';
    Logger.info('[dialog] auto-declined', {
      type: typeof p?.type === 'string' ? p.type : 'unknown',
    });
    wc.debugger.sendCommand('Page.handleJavaScriptDialog', { accept: false }).catch((err) => {
      // The dialog may already be gone (e.g. the tab navigated/closed underneath it) — never throw out
      // of an event handler for that.
      Logger.warn('[dialog] handleJavaScriptDialog failed', { err: String(err) });
    });
    push(tab, { kind: 'dialog', message, ts: Date.now() });
  });

  wc.on('will-prevent-unload', (event) => {
    event.preventDefault();
    push(tab, { kind: 'beforeunload', message: '', ts: Date.now() });
  });

  wc.once('destroyed', () => {
    state.delete(wc);
  });
}

/**
 * Dialogs/beforeunload prompts intercepted on `wc` at or after `sinceMs` (host clock).
 *
 * An empty array means **nothing was observed** — the tab may never have been attached — and must never
 * be read as "nothing happened". Mirrors `networkSince`'s own contract.
 */
export function interceptionsSince(wc: WebContents, sinceMs: number): InterceptedDialog[] {
  const tab = state.get(wc);
  if (tab === undefined) return [];
  return tab.events.filter((e) => e.ts >= sinceMs);
}
