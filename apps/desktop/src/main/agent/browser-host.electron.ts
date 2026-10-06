import type { BrowserHost } from '@tepegoz/browser-tools';
import type { ScreenshotToolsHost } from '@tepegoz/screenshots/tools';
import type { TabHost } from '@tepegoz/tab-engine';
import TabManager from '../tabs';
import CdpDriver from './cdp-driver.electron';
import { setDeviceEmulation } from './device-emulation.electron';
import { discoverSitemap } from '../web/web-tools-host.electron';
import AgentTabGroup from './agent-tab-group.electron';
import { resetForAgentAction } from './page-cursor.electron';
import { fillCredential as brokerFill } from './credential-broker.electron.js';
import { currentGroupId, setRunCurrentTab } from './browser-host-run-scope.electron';
import { requireWc, requireWcUntranslated, waitForLoad } from './browser-host-tab.electron';
import {
  historyGo,
  navigate,
  readArticleText,
  readPage,
  runExtractionScript,
  scrollToText,
  waitForCondition,
} from './browser-host-page.electron';
import { captureScreenshot, savePageAsPdf } from './browser-host-capture.electron';
import { adapterFor, onCursorHide, onInputAction } from './browser-host-input.electron';

/**
 * Desktop `BrowserHost` for `@tepegoz/browser-tools`: the Electron/WebContentsView operations behind
 * the built-in agent tools (navigate + read active page via the isolated view, list/create tabs).
 * Keeping this here lets the tools package stay Electron-free.
 *
 * This file composes the host from its responsibility modules and keeps the original public surface:
 * `browser-host-run-scope` (per-run event channels + ambient run), `browser-host-tab` (run working-tab
 * resolution), `browser-host-page` (navigate/read/wait/scroll/extract), `browser-host-capture`
 * (screenshot + PDF) and `browser-host-input` (cursor overlay + per-tab human-input adapters).
 */
export {
  setCurrentAgentRun,
  registerHeadlessRun,
  releaseAgentRun,
  withAgentRunScope,
  emitRunEvent,
  emitCurrentRunEvent,
} from './browser-host-run-scope.electron';
export { runActiveTabUrl, runWorkingTabPid } from './browser-host-tab.electron';

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
  consoleSince: (sinceMs, tabId) => {
    // P3-d read-only diagnostics: tolerant like the network/interception signals — a missing or
    // destroyed tab is "nothing observed", never an error that fails an otherwise-fine read.
    const wc =
      tabId === undefined ? TabManager.activeWebContents() : TabManager.webContentsForTab(tabId);
    if (wc === null || wc.isDestroyed()) return Promise.resolve([]);
    return Promise.resolve(CdpDriver.consoleSince(wc, sinceMs));
  },
  networkRequestsSince: (sinceMs, tabId) => {
    // P3-d network half — same tolerant shape: a missing/destroyed tab yields "nothing observed".
    const wc =
      tabId === undefined ? TabManager.activeWebContents() : TabManager.webContentsForTab(tabId);
    if (wc === null || wc.isDestroyed()) return Promise.resolve([]);
    return Promise.resolve(CdpDriver.networkRequestsSince(wc, sinceMs));
  },
  styleOfRef: (ref, tabId) => {
    // P3-d style half — same tolerant shape: a missing/destroyed tab yields "not found", never an error
    // that fails an otherwise-fine diagnostic read.
    const wc =
      tabId === undefined ? TabManager.activeWebContents() : TabManager.webContentsForTab(tabId);
    if (wc === null || wc.isDestroyed()) return Promise.resolve(null);
    return CdpDriver.styleOfRef(wc, ref);
  },
  queryElements: (query, queryType, tabId) => {
    // S2/PR7 P3-a — same tolerant shape as styleOfRef: a missing/destroyed tab is a clean ok:false
    // result, never an error that fails an otherwise-fine read.
    const wc =
      tabId === undefined ? TabManager.activeWebContents() : TabManager.webContentsForTab(tabId);
    if (wc === null || wc.isDestroyed()) {
      return Promise.resolve({ ok: false, error: 'no active tab', total: 0, matches: [] });
    }
    return CdpDriver.queryElements(wc, query, queryType);
  },
  captureScreenshot,
  setDeviceEmulation: (device, tabId) => {
    setDeviceEmulation(requireWc(tabId), device);
    return Promise.resolve();
  },
  discoverSitemap,
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
  dragElement: async (ref, targetRef, tabId) => {
    resetForAgentAction();
    const wc = requireWc(tabId);
    const result = await CdpDriver.dragElement(wc, ref, targetRef, adapterFor(wc));
    onCursorHide(wc);
    return result;
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
