/**
 * `@tepegoz/browser-tools` — the built-in browser/tab capabilities (L5) for the agent: read page,
 * navigate, list/create tabs, registered into the CapabilityRegistry and reached only through the
 * ToolGateway PEP. Electron-free: the concrete browser operations are injected via `BrowserHost`, and
 * perception (sanitize/wrap) is pure. Extracted from `apps/desktop` per docs/package-map.md.
 */
export {
  registerBuiltinTools,
  resetBuiltinToolsForTest,
  type BrowserHost,
  type JournalReader,
  type JournalEntry,
} from './builtin-tools';
export {
  buildPageSnapshot,
  buildElementsSnapshot,
  type PageSnapshot,
  type ElementsSnapshot,
} from './perception';
