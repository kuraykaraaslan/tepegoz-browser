import { AppError } from '@tepegoz/libs';
import type { WebContents } from 'electron';
import type { BrowserHost } from '@tepegoz/browser-tools';
import type { ScreenshotCaptureInput, ScreenshotCaptureResult } from '@tepegoz/screenshots';
import type { ScreenshotToolsHost } from '@tepegoz/screenshots/tools';
import type { TabHost } from '@tepegoz/tab-engine';
import { HumanInputAdapter, type CdpSend } from '@tepegoz/human-input';
import { IpcChannels, type AgentEvent, type AgentEventKind } from '@tepegoz/desktop-ipc';
import TabManager from '../tabs';
import CdpDriver from './cdp-driver.electron';
import AgentTabGroup from './agent-tab-group.electron';
import { showPageCursor, hidePageCursor, isUserControlActive, resetForAgentAction } from './page-cursor.electron';
import { buildArticleTextExpression } from './article-text-script.js';
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
    if (orphanId !== null && currentAgentGroupId !== null) {
      const newId = AgentTabGroup.openTab(currentAgentGroupId, url); // activates newId; throws if blocked
      TabManager.closeTab(orphanId); // orphan is no longer active → no reselection churn
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
  const wc = requireWc(tabId);
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
  const wc = requireWc(tabId);
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
  const wc = requireWc(tabId);
  const n = nth !== undefined && Number.isFinite(nth) && nth > 0 ? Math.min(Math.floor(nth), 50) : 1;
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
  const count = typeof shaped.count === 'number' && Number.isFinite(shaped.count) ? shaped.count : 0;
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
    height: typeof height === 'number' && Number.isFinite(height) ? Math.max(1, Math.round(height)) : 1,
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

async function captureScreenshot(input: ScreenshotCaptureInput = {}): Promise<ScreenshotCaptureResult> {
  const wc = requireWc(input.tabId);
  const mode = input.mode ?? 'viewport';
  const maxEdge = input.maxEdge ?? 1400;
  const page = await pageDimensions(wc);
  const truncated =
    mode === 'fullPage' && page.width * page.height > SCREENSHOT_MAX_CAPTURE_PIXELS;
  const captureHeight =
    truncated ? Math.max(1, Math.floor(SCREENSHOT_MAX_CAPTURE_PIXELS / page.width)) : page.height;
  const rect =
    mode === 'fullPage'
      ? { x: 0, y: 0, width: page.width, height: captureHeight }
      : undefined;
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

/** The target tab's WebContents for CDP-driven perception/action, or a 409 when there is none. */
function requireWc(tabId?: string): WebContents {
  const wc = tabId === undefined ? TabManager.activeWebContents() : TabManager.webContentsForTab(tabId);
  if (wc === null) throw new AppError(tabId === undefined ? 'No active page' : `No web tab: ${tabId}`, 409);
  return wc;
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

function onCursorMove(x: number, y: number): void {
  const wc = TabManager.activeWebContents();
  if (wc !== null) showPageCursor(wc, x, y);
  sendCursorPosition(x, y, true);
}

function onCursorHide(): void {
  const wc = TabManager.activeWebContents();
  if (wc !== null) hidePageCursor(wc);
  sendCursorPosition(0, 0, false);
}

// --- Input-action event wiring (agent progress panel) ---

let currentAgentRunId: string | null = null;
let currentAgentGroupId: string | null = null;
let currentAgentSend: ((e: AgentEvent) => void) | null = null;

/** Called by ipc.ts at the start/end of each agentRun to bind the active run's event channel. */
export function setCurrentAgentRun(
  runId: string | null,
  groupId: string | null,
  send: ((e: AgentEvent) => void) | null,
): void {
  currentAgentRunId = runId;
  currentAgentGroupId = groupId;
  currentAgentSend = send;
}

function onInputAction(kind: string, detail: string): void {
  emitCurrentRunEvent('input_action', `${kind} ${detail}`);
}

/** Emit a live event on the CURRENTLY-active agent run's channel (out-of-band from the reactor loop) —
 *  used by input-action narration and by the run-control handlers (paused/resumed/steered). No-op when no
 *  run is bound. */
export function emitCurrentRunEvent(kind: AgentEventKind, message: string, detail?: string): void {
  if (currentAgentRunId === null || currentAgentGroupId === null || currentAgentSend === null) return;
  currentAgentSend({
    runId: currentAgentRunId,
    groupId: currentAgentGroupId,
    kind,
    message,
    ...(detail !== undefined ? { detail } : {}),
    ts: Date.now(),
  });
}

// Single module-level adapter — curX/curY accumulate across agent actions within a session.
const cdpSend: CdpSend = (method, params) =>
  requireWc().debugger.sendCommand(method, params);

const browserAdapter = new HumanInputAdapter(cdpSend, onCursorMove, onInputAction, isUserControlActive);

// --- BrowserHost + TabHost (one object satisfies both injected seams) ---

export const browserHost: BrowserHost & TabHost & ScreenshotToolsHost = {
  navigate,
  readPage,
  readArticleText,
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
  createTab: (url, groupName, background) =>
    AgentTabGroup.openTab(currentAgentGroupId ?? '', url, groupName, background),
  activateTab: (id) => {
    if (!TabManager.getState().tabs.some((t) => t.id === id)) return false;
    TabManager.activate(id);
    // Report success only when the tab is now the active AND drivable page: a view-less internal tab
    // (e.g. the newtab) activates but yields no page for the browser_* tools, so returning `true` there
    // is a false success that makes the model treat it as usable and flail. `false` steers it to navigate.
    return TabManager.getState().activeId === id && TabManager.activeWebContents() !== null;
  },
  closeTab: (id) => {
    if (!TabManager.getState().tabs.some((t) => t.id === id)) return false;
    const agentGroupId = currentAgentGroupId;
    if (agentGroupId === null || !AgentTabGroup.ownsTab(agentGroupId, id)) return false;
    TabManager.closeTab(id);
    const closed = !TabManager.getState().tabs.some((t) => t.id === id);
    if (closed) AgentTabGroup.releaseTab(agentGroupId, id);
    return closed;
  },
  snapshotElements: (tabId, opts) => CdpDriver.snapshotElements(requireWc(tabId), opts ?? {}),
  // A stale ref / non-field element must read as "unverified", never as an error that fails the fill.
  readElementValue: (ref, tabId) => CdpDriver.readElementValue(requireWc(tabId), ref).catch(() => null),
  networkSince: (sinceMs, tabId) => {
    // Deliberately tolerant: a missing/destroyed tab yields "nothing observed", never an error — the
    // network signal is post-action EVIDENCE and must not be able to fail an otherwise-fine interaction.
    const wc = tabId === undefined ? TabManager.activeWebContents() : TabManager.webContentsForTab(tabId);
    if (wc === null || wc.isDestroyed()) return Promise.resolve([]);
    return Promise.resolve(CdpDriver.networkSince(wc, sinceMs));
  },
  captureScreenshot,
  clickElement: async (ref, tabId) => {
    resetForAgentAction();
    const result = await CdpDriver.clickElement(
      requireWc(tabId),
      ref,
      tabId === undefined ? browserAdapter : undefined,
    );
    onCursorHide();
    return result;
  },
  hoverElement: async (ref, tabId) => {
    resetForAgentAction();
    await CdpDriver.hoverElement(requireWc(tabId), ref, tabId === undefined ? browserAdapter : undefined);
  },
  fillElement: async (ref, text, tabId) => {
    resetForAgentAction();
    await CdpDriver.fillElement(requireWc(tabId), ref, text, tabId === undefined ? browserAdapter : undefined);
    onCursorHide();
  },
  pressKey: async (key, tabId) => {
    resetForAgentAction();
    const result = await CdpDriver.pressKey(
      requireWc(tabId),
      key,
      tabId === undefined ? browserAdapter : undefined,
    );
    onCursorHide();
    return result;
  },
  sendKeys: async (keys, tabId) => {
    resetForAgentAction();
    const result = await CdpDriver.sendKeys(
      requireWc(tabId),
      keys,
      tabId === undefined ? browserAdapter : undefined,
    );
    onCursorHide();
    return result;
  },
  scrollPage: async (direction, amount, tabId) => {
    resetForAgentAction();
    await CdpDriver.scrollPage(requireWc(tabId), direction, amount, tabId === undefined ? browserAdapter : undefined);
    onCursorHide();
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
