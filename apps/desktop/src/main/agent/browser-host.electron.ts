import { AsyncLocalStorage } from 'node:async_hooks';
import { AppError } from '@tepegoz/libs';
import type { WebContents } from 'electron';
import type { BrowserHost } from '@tepegoz/browser-tools';
import type { ScreenshotCaptureInput, ScreenshotCaptureResult } from '@tepegoz/screenshots';
import type { ScreenshotToolsHost } from '@tepegoz/screenshots/tools';
import type { TabHost } from '@tepegoz/tab-engine';
import { HumanInputAdapter, type CdpSend } from '@tepegoz/human-input';
import { IpcChannels, type AgentEvent, type AgentEventKind } from '@tepegoz/desktop-ipc';
import TabManager from '../tabs';
import DownloadService from '../downloads/download-service.electron';
import { originOf as originOfUrl } from '../downloads/download-service-fs.electron';
import { pdfFileName } from '../print/pdf-filename';
import { isParkedToTray } from '../window-parked';
import CdpDriver from './cdp-driver.electron';
import AgentTabGroup from './agent-tab-group.electron';
import {
  showPageCursor,
  hidePageCursor,
  isUserControlActive,
  resetForAgentAction,
} from './page-cursor.electron';
import TranslatePageInjector from '../extensions/translate-page-injector-controller.electron';
import { buildArticleTextExpression } from './article-text-script.js';
import { runExtraction } from './extraction-sandbox.electron.js';
import { fillCredential as brokerFill } from './credential-broker.electron.js';
import { buildWaitConditionExpression, clampWaitMs } from './wait-condition-script.js';

/**
 * Desktop `BrowserHost` for `@tepegoz/browser-tools`: the Electron/WebContentsView operations behind
 * the built-in agent tools (navigate + read active page via the isolated view, list/create tabs).
 * Keeping this here lets the tools package stay Electron-free.
 */
const DEFAULT_LOAD_TIMEOUT_MS = 15_000;
const SCREENSHOT_MAX_CAPTURE_PIXELS = 30_000_000;

async function waitForLoad(wc: WebContents, timeoutMs = DEFAULT_LOAD_TIMEOUT_MS): Promise<void> {
  await CdpDriver.waitForPageSettled(wc, timeoutMs);
}

async function navigate(url: string, tabId?: string): Promise<{ url: string; title: string }> {
  if (tabId === undefined) {
    // When the active tab is the view-less internal newtab, `navigateActive` would fork the navigation
    // into a brand-new UNGROUPED web tab (leaving the newtab orphaned) — which desyncs the agent's
    // active-tab target and produces "No active page" on the next read. Instead, open the page as a real
    // web tab INSIDE this run's group (create-or-reuse + ownership), then close the orphan so the result
    // replaces the newtab in place (Chrome parity). Only for an active agent run (group known).
    const orphanId = TabManager.viewlessActiveTabId();
    const runGroupId = currentGroupId();
    if (orphanId !== null && runGroupId !== null) {
      const newId = AgentTabGroup.openTab(runGroupId, url); // activates newId; throws if blocked
      TabManager.closeTab(orphanId); // orphan is no longer active → no reselection churn
      setRunCurrentTab(newId); // the run's page replaced the newtab — follow it there
      const wc = requireWc(newId);
      await waitForLoad(wc);
      if (wc.isDestroyed()) throw new AppError('Active tab was closed during navigation', 409);
      return { url: wc.getURL(), title: wc.getTitle() };
    }
    TabManager.navigateActive(url); // live web view (in-place), or no active run — scheme allow-list inside
  } else if (!TabManager.navigateTab(tabId, url)) {
    throw new AppError(`No web tab to navigate: ${tabId}`, 409);
  }
  const wc = requireWc(tabId);
  await waitForLoad(wc);
  // The tab may have been closed (webContents destroyed) during the up-to-15s wait — never call
  // methods on a destroyed WebContents (throws an opaque "Object has been destroyed").
  if (wc.isDestroyed()) throw new AppError('Active tab was closed during navigation', 409);
  return { url: wc.getURL(), title: wc.getTitle() };
}

async function readPage(
  tabId?: string,
): Promise<{ url: string; title: string; text: string; sig: string }> {
  // ADR-0042 §3: the agent reads untranslated source. If the tab is showing a page translation,
  // restore it before perceiving, so a run never depends on model output that was never in the page.
  const wc = await requireWcUntranslated(tabId);
  const url = wc.getURL();
  const title = wc.getTitle();
  // Read the visible text AND a structural signature of the on-screen actionable elements in one eval.
  // The signature hashes each visible interactive element's structural identity (tag · role · href-path ·
  // digit-masked label), in traversal order — NOT its position — so an in-place SPA toggle that slides a
  // drawer/menu/panel into the viewport changes it (the revealed controls become visible) while incidental
  // repaints/animations and live clock/counter labels do not. It pierces OPEN shadow roots and SAME-ORIGIN
  // iframes so it observes the same clickable surface AI-2 perception (buildDomTree) exposes to the model.
  // This is what lets browser_update_page tell a real state change from a genuine no-op. See
  // `packages/browser-tools`'s pageChanged.
  const result: unknown = await wc.executeJavaScript(
    `(() => {
      const text = document.body ? document.body.innerText : '';
      let sig = '';
      try {
        const SEL = 'a[href],button,input,select,textarea,summary,[role=button],[role=link],[role=menuitem],[role=tab],[role=checkbox],[role=switch],[onclick],[tabindex]';
        const CAP = 800;
        const parts = [];
        // Rendered? checkVisibility (Chromium 105+) also catches ANCESTOR opacity:0 / display:none /
        // content-visibility — the common CSS fade-in drawer/menu pattern a per-element style read misses.
        const shown = (el, win) => {
          if (typeof el.checkVisibility === 'function') {
            return el.checkVisibility({ opacityProperty: true, visibilityProperty: true, contentVisibilityAuto: true });
          }
          const st = win.getComputedStyle(el);
          return !(st.visibility === 'hidden' || st.display === 'none' || parseFloat(st.opacity) === 0);
        };
        const visit = (root, win) => {
          if (!root || !win || parts.length >= CAP) return;
          const vw = win.innerWidth || 0;
          const vh = win.innerHeight || 0;
          let nodes;
          try { nodes = root.querySelectorAll(SEL); } catch (_e) { nodes = []; }
          for (let i = 0; i < nodes.length && parts.length < CAP; i++) {
            const el = nodes[i];
            const r = el.getBoundingClientRect();
            if (r.width < 1 || r.height < 1) continue;                                  // zero-area
            if (r.bottom <= 0 || r.right <= 0 || r.top >= vh || r.left >= vw) continue; // off-viewport
            if (!shown(el, win)) continue;
            // Identity = tag · role · href(query dropped) · label(digits masked); el.value is excluded so a
            // live clock/counter/re-tokenized URL does not flip sig on a genuine no-op.
            let href = el.getAttribute('href') || '';
            const q = href.indexOf('?'); if (q >= 0) href = href.slice(0, q);
            const label = (el.getAttribute('aria-label') || el.textContent || '')
              .replace(/\\s+/g, ' ').trim().slice(0, 40).replace(/\\d+/g, '#');
            parts.push(el.tagName + '|' + (el.getAttribute('role') || '') + '|' + href + '|' + label);
          }
          // Open shadow roots (closed roots expose no .shadowRoot, so are invisible here — as intended).
          let hosts;
          try { hosts = root.querySelectorAll('*'); } catch (_e) { hosts = []; }
          for (let i = 0; i < hosts.length && parts.length < CAP; i++) {
            if (hosts[i].shadowRoot) visit(hosts[i].shadowRoot, win);
          }
          // Same-origin iframes (cross-origin contentDocument access throws → skipped).
          let frames;
          try { frames = root.querySelectorAll('iframe'); } catch (_e) { frames = []; }
          for (let i = 0; i < frames.length && parts.length < CAP; i++) {
            let doc = null, fwin = null;
            try { doc = frames[i].contentDocument; fwin = frames[i].contentWindow; } catch (_e) { doc = null; }
            if (doc && fwin) visit(doc, fwin);
          }
        };
        visit(document, window);
        // djb2 over the joined parts — a compact, order-sensitive fingerprint (not sent to the model).
        const s = parts.join('\\n');
        let h = 5381;
        for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
        sig = (h >>> 0).toString(36) + ':' + parts.length;
      } catch (_e) {
        sig = '';
      }
      return { text: typeof text === 'string' ? text : '', sig };
    })()`,
    true,
  );
  const shaped = (result ?? {}) as { text?: unknown; sig?: unknown };
  return {
    url,
    title,
    text: typeof shaped.text === 'string' ? shaped.text : '',
    sig: typeof shaped.sig === 'string' ? shaped.sig : '',
  };
}

/**
 * Move a tab through its own history, or reload it (S3 PR1).
 *
 * `moved` comes from the browser's own `canGoBack`/`canGoForward`, not from comparing URLs afterwards:
 * a site that pushes the same URL twice makes a real back step look like a no-op, and a genuine no-op
 * look like a step. Reload always counts as moved — it did do something.
 */
async function historyGo(
  direction: 'back' | 'forward' | 'reload',
  tabId?: string,
): Promise<{ url: string; title: string; moved: boolean }> {
  const wc = requireWc(tabId);
  let moved = true;
  if (direction === 'reload') {
    wc.reload();
  } else if (direction === 'back') {
    moved = wc.navigationHistory.canGoBack();
    if (moved) wc.navigationHistory.goBack();
  } else {
    moved = wc.navigationHistory.canGoForward();
    if (moved) wc.navigationHistory.goForward();
  }
  if (moved) await waitForLoad(wc);
  if (wc.isDestroyed()) throw new AppError('Active tab was closed during history navigation', 409);
  return { url: wc.getURL(), title: wc.getTitle(), moved };
}

/**
 * Wait until a condition holds, bounded by an explicit timeout (S3 PR1).
 *
 * `network_idle` reuses the driver's existing settle logic (load-stop → network idle → DOM quiescence)
 * rather than inventing a second definition of "quiet" that could disagree with the one every
 * interaction is already judged by. `text`/`selector` poll inside the page.
 *
 * An unsatisfied wait is a RESULT, never an error: the model needs to know it waited and the thing did
 * not arrive, so it can act differently instead of retrying blind.
 */
async function waitForCondition(
  condition: { kind: 'text' | 'selector' | 'network_idle'; value?: string; timeoutMs: number },
  tabId?: string,
): Promise<{ satisfied: boolean; waitedMs: number }> {
  const wc = requireWc(tabId);
  const timeoutMs = clampWaitMs(condition.timeoutMs);
  const started = Date.now();
  if (condition.kind === 'network_idle') {
    await CdpDriver.waitForPageSettled(wc, timeoutMs);
    return { satisfied: true, waitedMs: Date.now() - started };
  }
  const value = condition.value ?? '';
  if (value.length === 0) return { satisfied: false, waitedMs: 0 };
  const raw: unknown = await wc.executeJavaScript(
    buildWaitConditionExpression(condition.kind, value, timeoutMs),
    true,
  );
  const shaped = (raw ?? {}) as { satisfied?: unknown; waitedMs?: unknown };
  return {
    satisfied: shaped.satisfied === true,
    waitedMs: typeof shaped.waitedMs === 'number' ? shaped.waitedMs : Date.now() - started,
  };
}

/**
 * Read the page's article text (S2 PR4): the content root the page declares, minus the chrome every page
 * agrees on. Runs in the page's main world like {@link readPage} — it only reads, and it clones before it
 * strips, so nothing is mutated. A malformed result degrades to empty text labelled `'body'` rather than
 * to a claim that an article was found.
 */
async function readArticleText(
  tabId?: string,
): Promise<{ url: string; title: string; text: string; source: string }> {
  const wc = await requireWcUntranslated(tabId); // ADR-0042 §3 — untranslated source
  const result: unknown = await wc.executeJavaScript(buildArticleTextExpression(), true);
  const shaped = (result ?? {}) as { text?: unknown; source?: unknown };
  return {
    url: wc.getURL(),
    title: wc.getTitle(),
    text: typeof shaped.text === 'string' ? shaped.text : '',
    source: typeof shaped.source === 'string' ? shaped.source : 'body',
  };
}

/** Content-addressed reveal: scroll the `nth` on-page occurrence of `text` into view via the browser's
 *  native find (which searches same-origin frames), then EXPLICITLY scroll the matched node to centre —
 *  a `scrollIntoView` is focus/visibility-independent, unlike `window.find`'s implicit selection-scroll —
 *  and clear the selection so no highlight lingers and no later keypress operates on the selected range.
 *  Deterministic and rule-based (no wheel-delta guesswork). Resolves `{ found, count }`: `count` is how
 *  many occurrences were located (≤ nth), so a shortfall is reported honestly rather than as "no match".
 *  The text is embedded with JSON.stringify so it can never break out of the string literal. */
async function scrollToText(
  text: string,
  nth?: number,
  tabId?: string,
): Promise<{ found: boolean; count: number }> {
  const wc = await requireWcUntranslated(tabId); // ADR-0042 §3 — match against untranslated text
  const n =
    nth !== undefined && Number.isFinite(nth) && nth > 0 ? Math.min(Math.floor(nth), 50) : 1;
  const raw: unknown = await wc.executeJavaScript(
    `(() => {
      try {
        const t = ${JSON.stringify(text)};
        const sel = window.getSelection ? window.getSelection() : null;
        if (sel) sel.removeAllRanges();               // start the search from the top of the document
        let count = 0;
        for (let i = 0; i < ${String(n)}; i++) {
          // window.find(text, caseSensitive, backwards, wrapAround, wholeWord, searchInFrames, showDialog)
          if (window.find(t, false, false, false, false, true, false)) count++;
          else break;                                 // fewer than nth matches -> stop; count is the total
        }
        if (count > 0 && sel && sel.rangeCount > 0) {
          const node = sel.getRangeAt(0).startContainer;
          const el = node && node.nodeType === 1 ? node : (node ? node.parentElement : null);
          if (el && typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'center', inline: 'nearest' });
          sel.removeAllRanges();                       // drop the highlight; no lingering selection to act on
        }
        return { found: count > 0, count: count };
      } catch (_e) {
        return { found: false, count: 0 };
      }
    })()`,
    true,
  );
  const shaped = (raw as { found?: unknown; count?: unknown } | null) ?? {};
  const count =
    typeof shaped.count === 'number' && Number.isFinite(shaped.count) ? shaped.count : 0;
  return { found: shaped.found === true, count };
}

interface PageDimensions {
  width: number;
  height: number;
}

async function pageDimensions(wc: WebContents): Promise<PageDimensions> {
  const raw: unknown = await wc.executeJavaScript(
    `(() => {
      const d = document.documentElement;
      const b = document.body;
      return {
        width: Math.ceil(Math.max(d?.scrollWidth || 0, d?.clientWidth || 0, b?.scrollWidth || 0, b?.clientWidth || 0, 1)),
        height: Math.ceil(Math.max(d?.scrollHeight || 0, d?.clientHeight || 0, b?.scrollHeight || 0, b?.clientHeight || 0, 1))
      };
    })()`,
    true,
  );
  if (typeof raw !== 'object' || raw === null) return { width: 1, height: 1 };
  const width = (raw as { width?: unknown }).width;
  const height = (raw as { height?: unknown }).height;
  return {
    width: typeof width === 'number' && Number.isFinite(width) ? Math.max(1, Math.round(width)) : 1,
    height:
      typeof height === 'number' && Number.isFinite(height) ? Math.max(1, Math.round(height)) : 1,
  };
}

function resizeForMaxEdge(image: Electron.NativeImage, maxEdge: number): Electron.NativeImage {
  const size = image.getSize();
  const scale = Math.min(1, maxEdge / Math.max(size.width, size.height));
  if (scale >= 1) return image;
  return image.resize({
    width: Math.max(1, Math.round(size.width * scale)),
    height: Math.max(1, Math.round(size.height * scale)),
  });
}

async function captureScreenshot(
  input: ScreenshotCaptureInput = {},
): Promise<ScreenshotCaptureResult> {
  const wc = requireWc(input.tabId);
  const mode = input.mode ?? 'viewport';
  const maxEdge = input.maxEdge ?? 1400;
  const page = await pageDimensions(wc);
  const truncated = mode === 'fullPage' && page.width * page.height > SCREENSHOT_MAX_CAPTURE_PIXELS;
  const captureHeight = truncated
    ? Math.max(1, Math.floor(SCREENSHOT_MAX_CAPTURE_PIXELS / page.width))
    : page.height;
  const rect =
    mode === 'fullPage' ? { x: 0, y: 0, width: page.width, height: captureHeight } : undefined;
  const raw = await wc.capturePage(rect);
  if (raw.isEmpty()) throw new AppError('Could not capture page screenshot', 502);
  const image = resizeForMaxEdge(raw, maxEdge);
  const nextSize = image.getSize();
  const dataUrl = image.toDataURL();
  const result: ScreenshotCaptureResult = {
    url: wc.getURL(),
    title: wc.getTitle(),
    mode,
    mimeType: 'image/png',
    dataUrl,
    width: nextSize.width,
    height: nextSize.height,
    pageWidth: page.width,
    pageHeight: page.height,
    byteLength: Buffer.byteLength(dataUrl, 'utf8'),
    capturedAt: Date.now(),
  };
  return truncated ? { ...result, truncated: true } : result;
}

/**
 * The tab a run means when it names no `tabId` — its OWN working tab, not "whatever is active now".
 *
 * A run latches its working tab the first time it needs one, from the tab that is globally active at
 * that moment. That first read is what makes "summarize this page" work: the page the user was looking
 * at when they asked is the page the run binds to, even if it belongs to no group or to another one.
 * From then on the run keeps driving that tab, and follows it only through its OWN navigations
 * ({@link setRunCurrentTab}).
 *
 * Two things fall out of the latch. A user switching tabs mid-run no longer silently re-targets the
 * agent — previously the next `tabId`-less action jumped to the newly-focused page. And two runs no
 * longer resolve to the same tab, which is the property that lets them run at once.
 *
 * If the latched tab is gone (closed), the run re-latches onto whatever is active — a run whose page
 * was closed under it should keep working, not die.
 */
function resolveRunTab(): WebContents | null {
  const record = currentRunRecord();
  if (record !== null && record.currentTabId !== null) {
    const held = TabManager.webContentsForTab(record.currentTabId);
    if (held !== null && !held.isDestroyed()) return held;
  }
  const active = TabManager.activeWebContents();
  if (active !== null && record !== null) {
    // Latch (or re-latch) so every later tabId-less action in this run means THIS tab.
    record.currentTabId = TabManager.getState().activeId;
  }
  return active;
}

/** The target tab's WebContents for CDP-driven perception/action, or a 409 when there is none. */
function requireWc(tabId?: string): WebContents {
  const wc = tabId === undefined ? resolveRunTab() : TabManager.webContentsForTab(tabId);
  if (wc === null)
    throw new AppError(tabId === undefined ? 'No active page' : `No web tab: ${tabId}`, 409);
  return wc;
}

/**
 * As {@link requireWc}, but first restores any in-place page translation so the agent reads
 * untranslated source (ADR-0042 §3). Use for every path that reads DOM text/structure into the model
 * or the Notary; plain {@link requireWc} is fine for pure actions (click, scroll-by-pixels).
 */
async function requireWcUntranslated(tabId?: string): Promise<WebContents> {
  const wc = requireWc(tabId);
  await TranslatePageInjector.ensureUntranslatedForAgent(wc).catch(() => undefined);
  return wc;
}

/** The URL of the tab THIS run is working in — the Policy Kernel's site context, so the site a call is
 *  judged against is always the site it will actually hit. */
export function runActiveTabUrl(): string | undefined {
  const wc = resolveRunTab();
  if (wc === null || wc.isDestroyed()) return undefined;
  const url = wc.getURL();
  return url.length > 0 ? url : undefined;
}

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

function onCursorHide(wc: WebContents): void {
  if (!wc.isDestroyed()) hidePageCursor(wc);
  if (isVisibleTab(wc)) sendCursorPosition(0, 0, false);
}

// --- Input-action event wiring (agent progress panel) ---

interface RunChannel {
  groupId: string;
  send: (e: AgentEvent) => void;
  /** The tab this run is working in — see {@link resolveRunTab}. Null until the run latches one. */
  currentTabId: string | null;
}

/**
 * Every live run's event channel, keyed by runId — not a single "current run" pointer.
 *
 * A pointer was last-writer-wins: a second run starting re-pointed it, and the first run's
 * out-of-band narration (input actions, pause/resume/steer) would then be delivered to the SECOND
 * run's panel, labelled with the second run's ids. Keyed by runId, each event reaches the run that
 * actually produced it.
 */
const runChannels = new Map<string, RunChannel>();

/**
 * Which run the current async context belongs to.
 *
 * The narration callers (the input adapter, tab ownership) are deep inside the run's own call stack
 * and cannot be handed a runId, so they read it from the ambient scope the same way `ToolGateway`
 * resolves its handlers. Callers that DO know the run (the IPC control handlers) name it explicitly
 * via {@link emitRunEvent} instead of relying on ambience.
 */
const runScope = new AsyncLocalStorage<string>();

/** Called by ipc.ts at the start/end of each agentRun to bind (or release) that run's event channel. */
export function setCurrentAgentRun(
  runId: string | null,
  groupId: string | null,
  send: ((e: AgentEvent) => void) | null,
): void {
  if (runId === null) return; // release is per-run — see releaseAgentRun
  if (groupId === null || send === null) {
    runChannels.delete(runId);
    return;
  }
  runChannels.set(runId, { groupId, send, currentTabId: null });
}

/**
 * Register a run that has no renderer channel (the background task runner). It still needs its own
 * working-tab latch and group, or an unattended task would drive whatever tab the user is looking at.
 */
export function registerHeadlessRun(runId: string, groupId: string): void {
  runChannels.set(runId, { groupId, send: () => undefined, currentTabId: null });
}

/** The ambient run's record, or null outside a run. */
function currentRunRecord(): RunChannel | null {
  const runId = runScope.getStore();
  if (runId === undefined) return null;
  return runChannels.get(runId) ?? null;
}

/** Point the ambient run at a tab it just opened/activated, so later tabId-less actions follow it. */
function setRunCurrentTab(tabId: string): void {
  const record = currentRunRecord();
  if (record !== null) record.currentTabId = tabId;
}

/** Drop one run's channel (its handler's teardown path). */
export function releaseAgentRun(runId: string): void {
  runChannels.delete(runId);
}

/** Run `fn` with `runId` as the ambient run, so in-run narration reaches the right panel. */
export function withAgentRunScope<T>(runId: string, fn: () => Promise<T>): Promise<T> {
  return runScope.run(runId, fn);
}

/** The group of the run owning the current async context (tab-ownership checks). */
function currentGroupId(): string | null {
  return currentRunRecord()?.groupId ?? null;
}

function onInputAction(kind: string, detail: string): void {
  emitCurrentRunEvent('input_action', `${kind} ${detail}`);
}

/** Emit a live event on a NAMED run's channel. No-op when that run has no channel bound. */
export function emitRunEvent(
  runId: string,
  kind: AgentEventKind,
  message: string,
  detail?: string,
): void {
  const channel = runChannels.get(runId);
  if (channel === undefined) return;
  channel.send({
    runId,
    groupId: channel.groupId,
    kind,
    message,
    ...(detail !== undefined ? { detail } : {}),
    ts: Date.now(),
  });
}

/** Emit on the run owning the current async context — input-action narration, out-of-band from the
 *  reactor loop. No-op outside a run. */
export function emitCurrentRunEvent(kind: AgentEventKind, message: string, detail?: string): void {
  const runId = runScope.getStore();
  if (runId === undefined) return;
  emitRunEvent(runId, kind, message, detail);
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

function adapterFor(wc: WebContents): HumanInputAdapter {
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

// --- BrowserHost + TabHost (one object satisfies both injected seams) ---

/**
 * Run a model-authored extraction script (S5).
 *
 * The page HTML is read out here and COPIED into the sandbox — the script never touches the live
 * page, and the sandbox it does run in has no network. Both properties are measured, not asserted:
 * see `e2e/spike-code-exec-sandbox.spec.ts`.
 */
async function runExtractionScript(script: string, tabId?: string): Promise<unknown> {
  const wc = await requireWcUntranslated(tabId); // ADR-0042 §3 — extract from untranslated DOM
  const html: unknown = await wc.executeJavaScript('document.documentElement.outerHTML', true);
  return runExtraction({ html: typeof html === 'string' ? html : '', script });
}

/**
 * `browser_save_pdf` — the agent's only way to put a file on disk, and it is not really one.
 *
 * `printToPDF` produces bytes; those bytes go into `DownloadService.ingestGeneratedFile`, which is the
 * SAME quarantine → hash → trust-check → human-release path every download takes. So this adds no
 * write path and no trust exemption: the agent can cause a file to exist in quarantine, and only a
 * person can move it anywhere the user would look.
 *
 * The filename comes from the page title, so it goes through `pdfFileName` first — the title is
 * attacker-controlled and would otherwise reach a path.
 *
 * What comes back is an id and a name, never a path. The agent has no filesystem, and handing it one
 * string of a real one is how that stops being true.
 */
async function savePageAsPdf(
  tabId?: string,
): Promise<{ downloadId: string; filename: string; bytes: number }> {
  const wc = requireWc(tabId);
  const pdf = await wc.printToPDF({});
  const filename = pdfFileName(wc.getTitle());
  const sourceUrl = wc.getURL();
  const downloadId = await DownloadService.ingestGeneratedFile({
    filename,
    mimeType: 'application/pdf',
    bytes: pdf,
    sourceUrl,
    // `actor: 'agent'` is stamped HERE, by the host, exactly as it is for an agent download — the
    // model cannot set its own actor, and `releaseNeedsApproval` refuses an agent record without a
    // human whatever the file turns out to be.
    provenance: { actor: 'agent', sourceUrl, sourceOrigin: originOfUrl(sourceUrl) },
  });
  return { downloadId, filename, bytes: pdf.byteLength };
}

export const browserHost: BrowserHost & TabHost & ScreenshotToolsHost = {
  navigate,
  readPage,
  readArticleText,
  savePageAsPdf,
  runExtractionScript,
  historyGo,
  waitForCondition,
  waitForLoad: async (tabId, timeoutMs) => {
    const wc = requireWc(tabId);
    await waitForLoad(wc, timeoutMs);
    return { url: wc.getURL(), title: wc.getTitle() };
  },
  listOpenTabs: () =>
    TabManager.getState().tabs.map((t) => ({ id: t.id, url: t.url, title: t.title })),
  listTabs: () => {
    const state = TabManager.getState();
    return state.tabs.map((t) => ({
      id: t.id,
      title: t.title,
      url: t.url,
      active: t.id === state.activeId,
    }));
  },
  createTab: (url, groupName, background) => {
    const id = AgentTabGroup.openTab(currentGroupId() ?? '', url, groupName, background);
    // A foreground tab becomes the run's working tab; a background one deliberately does not, so the
    // run keeps acting where it was until it explicitly switches.
    if (background !== true) setRunCurrentTab(id);
    return id;
  },
  activateTab: (id) => {
    if (!TabManager.getState().tabs.some((t) => t.id === id)) return false;
    TabManager.activate(id);
    // An explicit switch is exactly when the run means to change tabs — follow it, whether or not the
    // tab turns out to be drivable (the run asked for it; a later action will report a view-less tab).
    setRunCurrentTab(id);
    // Report success only when the tab is now the active AND drivable page: a view-less internal tab
    // (e.g. the newtab) activates but yields no page for the browser_* tools, so returning `true` there
    // is a false success that makes the model treat it as usable and flail. `false` steers it to navigate.
    return TabManager.getState().activeId === id && TabManager.activeWebContents() !== null;
  },
  closeTab: (id) => {
    if (!TabManager.getState().tabs.some((t) => t.id === id)) return false;
    const agentGroupId = currentGroupId();
    if (agentGroupId === null || !AgentTabGroup.ownsTab(agentGroupId, id)) return false;
    TabManager.closeTab(id);
    const closed = !TabManager.getState().tabs.some((t) => t.id === id);
    if (closed) AgentTabGroup.releaseTab(agentGroupId, id);
    return closed;
  },
  // ADR-0042 §3 — the actionable-element perception must also read untranslated source.
  snapshotElements: async (tabId, opts) =>
    CdpDriver.snapshotElements(await requireWcUntranslated(tabId), opts ?? {}),
  // A stale ref / non-field element must read as "unverified", never as an error that fails the fill.
  readElementValue: (ref, tabId) =>
    CdpDriver.readElementValue(requireWc(tabId), ref).catch(() => null),
  // S6 PR6: the broker fills through the SAME real-gesture path as any other fill — the secret's only
  // journey is vault → main → page, and it never enters an argument the agent supplied or a result it
  // receives.
  fillCredential: (ref, field, tabId) =>
    brokerFill(ref, field, tabId, {
      pageUrl: (id) => requireWc(id).getURL(),
      fill: async (target, text, id) => {
        resetForAgentAction();
        const wc = requireWc(id);
        const result = await CdpDriver.fillElement(wc, target, text, adapterFor(wc));
        onCursorHide(wc);
        return result;
      },
    }),
  networkSince: (sinceMs, tabId) => {
    // Deliberately tolerant: a missing/destroyed tab yields "nothing observed", never an error — the
    // network signal is post-action EVIDENCE and must not be able to fail an otherwise-fine interaction.
    const wc =
      tabId === undefined ? TabManager.activeWebContents() : TabManager.webContentsForTab(tabId);
    if (wc === null || wc.isDestroyed()) return Promise.resolve([]);
    return Promise.resolve(CdpDriver.networkSince(wc, sinceMs));
  },
  interceptionsSince: (sinceMs, tabId) => {
    const wc =
      tabId === undefined ? TabManager.activeWebContents() : TabManager.webContentsForTab(tabId);
    if (wc === null || wc.isDestroyed()) return Promise.resolve([]);
    return Promise.resolve(CdpDriver.interceptionsSince(wc, sinceMs));
  },
  captureScreenshot,
  clickElement: async (ref, tabId) => {
    resetForAgentAction();
    const wc = requireWc(tabId);
    const result = await CdpDriver.clickElement(wc, ref, adapterFor(wc));
    onCursorHide(wc);
    return result;
  },
  hoverElement: async (ref, tabId) => {
    resetForAgentAction();
    const wc = requireWc(tabId);
    await CdpDriver.hoverElement(wc, ref, adapterFor(wc));
  },
  fillElement: async (ref, text, tabId) => {
    resetForAgentAction();
    const wc = requireWc(tabId);
    const result = await CdpDriver.fillElement(wc, ref, text, adapterFor(wc));
    onCursorHide(wc);
    return result;
  },
  pressKey: async (key, tabId) => {
    resetForAgentAction();
    const wc = requireWc(tabId);
    const result = await CdpDriver.pressKey(wc, key, adapterFor(wc));
    onCursorHide(wc);
    return result;
  },
  sendKeys: async (keys, tabId) => {
    resetForAgentAction();
    const wc = requireWc(tabId);
    const result = await CdpDriver.sendKeys(wc, keys, adapterFor(wc));
    onCursorHide(wc);
    return result;
  },
  scrollPage: async (direction, amount, tabId) => {
    resetForAgentAction();
    const wc = requireWc(tabId);
    await CdpDriver.scrollPage(wc, direction, amount, adapterFor(wc));
    onCursorHide(wc);
  },
  scrollToText: (text, nth, tabId) => {
    // Narrate to the Agent Console for parity with the adapter-driven actions (this reveal bypasses the
    // HumanInputAdapter, which is what normally emits the input_action event).
    onInputAction('scroll_to_text', text.length > 60 ? `${text.slice(0, 60)}…` : text);
    return scrollToText(text, nth, tabId);
  },
  selectOption: (ref, value, tabId) => {
    // Deterministic CDP set (native selects open an OS popup no synthetic click can drive); narrate for
    // parity with adapter-driven actions since this bypasses the HumanInputAdapter.
    resetForAgentAction();
    onInputAction('select_option', value.length > 60 ? `${value.slice(0, 60)}…` : value);
    return CdpDriver.selectOption(requireWc(tabId), ref, value);
  },
};
