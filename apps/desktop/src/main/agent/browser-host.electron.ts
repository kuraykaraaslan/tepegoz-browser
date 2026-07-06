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
async function navigateActive(url: string): Promise<{ url: string; title: string }> {
  TabManager.navigateActive(url); // scheme allow-list enforced inside
  const wc = TabManager.activeWebContents();
  if (wc === null) throw new AppError('No active tab to navigate', 409);
  await new Promise<void>((resolve) => {
    const onDone = (): void => {
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(() => {
      wc.removeListener('did-stop-loading', onDone);
      resolve();
    }, 15_000);
    wc.once('did-stop-loading', onDone);
  });
  // The tab may have been closed (webContents destroyed) during the up-to-15s wait — never call
  // methods on a destroyed WebContents (throws an opaque "Object has been destroyed").
  if (wc.isDestroyed()) throw new AppError('Active tab was closed during navigation', 409);
  return { url: wc.getURL(), title: wc.getTitle() };
}

async function readActivePage(): Promise<{ url: string; title: string; text: string }> {
  const wc = TabManager.activeWebContents();
  if (wc === null) throw new AppError('No active page to read', 409);
  const url = wc.getURL();
  const title = wc.getTitle();
  const result: unknown = await wc.executeJavaScript(
    'document.body ? document.body.innerText : ""',
    true,
  );
  return { url, title, text: typeof result === 'string' ? result : '' };
}

/** The active tab's WebContents for CDP-driven perception/action, or a 409 when there is none. */
function requireActiveWc(): WebContents {
  const wc = TabManager.activeWebContents();
  if (wc === null) throw new AppError('No active page', 409);
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
  requireActiveWc().debugger.sendCommand(method, params);

const browserAdapter = new HumanInputAdapter(cdpSend, onCursorMove, onInputAction, isUserControlActive);

// --- BrowserHost + TabHost (one object satisfies both injected seams) ---

export const browserHost: BrowserHost & TabHost = {
  navigateActive,
  readActivePage,
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
  snapshotElements: () => CdpDriver.snapshotElements(requireActiveWc()),
  clickElement: async (ref) => {
    resetForAgentAction();
    await CdpDriver.clickElement(requireActiveWc(), ref, browserAdapter);
    onCursorHide();
  },
  fillElement: async (ref, text) => {
    resetForAgentAction();
    await CdpDriver.fillElement(requireActiveWc(), ref, text, browserAdapter);
    onCursorHide();
  },
  pressKey: async (key) => {
    resetForAgentAction();
    await CdpDriver.pressKey(requireActiveWc(), key, browserAdapter);
    onCursorHide();
  },
  scrollPage: async (direction, amount) => {
    resetForAgentAction();
    await CdpDriver.scrollPage(requireActiveWc(), direction, amount, browserAdapter);
    onCursorHide();
  },
};
