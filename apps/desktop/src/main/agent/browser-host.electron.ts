import { AppError } from '@tepegoz/libs';
import type { BrowserWindow, WebContents } from 'electron';
import type { BrowserHost } from '@tepegoz/browser-tools';
import type { TabHost } from '@tepegoz/tab-engine';
import { HumanInputAdapter, type CdpSend } from '@tepegoz/human-input';
import { IpcChannels, type AgentEvent } from '@tepegoz/desktop-ipc';
import TabManager from '../tabs';
import CdpDriver from './cdp-driver.electron';
import AgentTabGroup from './agent-tab-group.electron';
import { showPageCursor, hidePageCursor, isUserControlActive, resetForAgentAction } from './page-cursor.electron';

/**
 * Desktop `BrowserHost` for `@tepegoz/browser-tools`: the Electron/WebContentsView operations behind
 * the built-in agent tools (navigate + read active page via the isolated view, list/create tabs).
 * Keeping this here lets the tools package stay Electron-free.
 */
const DEFAULT_LOAD_TIMEOUT_MS = 15_000;

async function waitForLoad(wc: WebContents, timeoutMs = DEFAULT_LOAD_TIMEOUT_MS): Promise<void> {
  await new Promise<void>((resolve) => {
    const onDone = (): void => {
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(() => {
      wc.removeListener('did-stop-loading', onDone);
      resolve();
    }, timeoutMs);
    wc.once('did-stop-loading', onDone);
  });
}

async function navigate(url: string, tabId?: string): Promise<{ url: string; title: string }> {
  if (tabId === undefined) {
    TabManager.navigateActive(url); // scheme allow-list enforced inside
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

async function readPage(tabId?: string): Promise<{ url: string; title: string; text: string }> {
  const wc = requireWc(tabId);
  const url = wc.getURL();
  const title = wc.getTitle();
  const result: unknown = await wc.executeJavaScript(
    'document.body ? document.body.innerText : ""',
    true,
  );
  return { url, title, text: typeof result === 'string' ? result : '' };
}

/** The target tab's WebContents for CDP-driven perception/action, or a 409 when there is none. */
function requireWc(tabId?: string): WebContents {
  const wc = tabId === undefined ? TabManager.activeWebContents() : TabManager.webContentsForTab(tabId);
  if (wc === null) throw new AppError(tabId === undefined ? 'No active page' : `No web tab: ${tabId}`, 409);
  return wc;
}

// --- Cursor overlay wiring ---

let mainWin: BrowserWindow | null = null;

/** Called from index.ts after createWindow(); provides the target for cursor IPC pushes. */
export function attachBrowserHostWindow(win: BrowserWindow): void {
  mainWin = win;
}

function sendCursorPosition(x: number, y: number, visible: boolean): void {
  if (mainWin === null || mainWin.isDestroyed()) return;
  const b = TabManager.getContentBounds();
  mainWin.webContents.send(IpcChannels.cursorPosition, {
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
  if (currentAgentRunId === null || currentAgentGroupId === null || currentAgentSend === null) return;
  currentAgentSend({
    runId: currentAgentRunId,
    groupId: currentAgentGroupId,
    kind: 'input_action',
    message: `${kind} ${detail}`,
    ts: Date.now(),
  });
}

// Single module-level adapter — curX/curY accumulate across agent actions within a session.
const cdpSend: CdpSend = (method, params) =>
  requireWc().debugger.sendCommand(method, params);

const browserAdapter = new HumanInputAdapter(cdpSend, onCursorMove, onInputAction, isUserControlActive);

// --- BrowserHost + TabHost (one object satisfies both injected seams) ---

export const browserHost: BrowserHost & TabHost = {
  navigate,
  readPage,
  waitForLoad: async (tabId, timeoutMs) => {
    const wc = requireWc(tabId);
    await waitForLoad(wc, timeoutMs);
    return { url: wc.getURL(), title: wc.getTitle() };
  },
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
    return TabManager.getState().activeId === id;
  },
  closeTab: (id) => {
    if (!TabManager.getState().tabs.some((t) => t.id === id)) return false;
    TabManager.closeTab(id);
    return !TabManager.getState().tabs.some((t) => t.id === id);
  },
  snapshotElements: (tabId) => CdpDriver.snapshotElements(requireWc(tabId)),
  clickElement: async (ref, tabId) => {
    resetForAgentAction();
    await CdpDriver.clickElement(requireWc(tabId), ref, tabId === undefined ? browserAdapter : undefined);
    onCursorHide();
  },
  fillElement: async (ref, text, tabId) => {
    resetForAgentAction();
    await CdpDriver.fillElement(requireWc(tabId), ref, text, tabId === undefined ? browserAdapter : undefined);
    onCursorHide();
  },
  pressKey: async (key, tabId) => {
    resetForAgentAction();
    await CdpDriver.pressKey(requireWc(tabId), key, tabId === undefined ? browserAdapter : undefined);
    onCursorHide();
  },
  scrollPage: async (direction, amount, tabId) => {
    resetForAgentAction();
    await CdpDriver.scrollPage(requireWc(tabId), direction, amount, tabId === undefined ? browserAdapter : undefined);
    onCursorHide();
  },
  setFileInputFiles: async (ref, paths, tabId) => {
    resetForAgentAction();
    await CdpDriver.setFileInputFiles(requireWc(tabId), ref, paths);
    onCursorHide();
  },
};
