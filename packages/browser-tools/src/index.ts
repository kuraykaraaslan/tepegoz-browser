/**
 * `@tepegoz/browser-tools` — the Electron-free building blocks for the agent's built-in `browser_*`
 * tools: the `BrowserHost` host contract (injected by the app), the `registerBrowserTools` registration
 * factory, and pure perception (sanitize/wrap) helpers. The tools register directly into the single
 * `CapabilityRegistry` behind the ToolGateway PEP as always-on `source: 'builtin'` tools. Tab tools live
 * in `@tepegoz/tab-engine`; journal tools in `@tepegoz/journal-tools`. Extracted from `apps/desktop` per
 * docs/package-map.md.
 */
export { type BrowserHost } from './host';
export { registerBrowserTools } from './browser-tools';
export {
  buildPageSnapshot,
  buildElementsSnapshot,
  type PageSnapshot,
  type ElementsSnapshot,
} from './perception';
export {
  describeNetworkFailures,
  displayUrl,
  isReportableFailure,
  selectActionFailures,
  MAX_REPORTED_FAILURES,
  type NetworkObservation,
} from './network-verify';
