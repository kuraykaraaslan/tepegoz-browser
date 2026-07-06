/**
 * `@tepegoz/browser-tools` — the Electron-free building blocks for the agent's built-in browser/tab
 * tools: the `BrowserHost`/`JournalReader` host contracts (injected by the app) and pure perception
 * (sanitize/wrap) helpers. The tools themselves are declared as the Agent extension's capabilities in
 * `@tepegoz/ext-agent`'s `agentBuiltinCapabilities` (ADR-0021), reached only through the ToolGateway
 * PEP. Extracted from `apps/desktop` per docs/package-map.md.
 */
export {
  type BrowserHost,
  type JournalReader,
  type JournalEntry,
} from './host';
export {
  buildPageSnapshot,
  buildElementsSnapshot,
  type PageSnapshot,
  type ElementsSnapshot,
} from './perception';
