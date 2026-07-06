import type { RawInteractable } from '@tepegoz/tool-executor';

/**
 * The browser operations the built-in `browser_*` agent tools need, abstracted away from
 * Electron. The desktop app implements this over its TabManager + WebContentsView; a headless/remote
 * browser-agent could implement it differently. Keeping the tools behind this seam is what lets
 * `registerBrowserTools` stay Electron-free. Tab enumeration/creation is a separate concern —
 * see `@tepegoz/tab-engine`'s `TabHost`.
 */
export interface BrowserHost {
  /** Navigate a tab to `url` (scheme allow-list enforced by the host) and resolve once
   *  loading settles, with the final url + title. */
  navigate(url: string, tabId?: string): Promise<{ url: string; title: string }>;
  /** Read a page: its url, title, and the raw (unsanitized) visible text. */
  readPage(tabId?: string): Promise<{ url: string; title: string; text: string }>;
  /** Read a page's actionable elements (accessibility tree). The host keeps the
   *  `ref → node` map for the action calls below, so `ref`s stay valid until the next snapshot. */
  snapshotElements(tabId?: string): Promise<{ url: string; title: string; elements: RawInteractable[] }>;
  /** Click the element identified by `ref` from the most recent {@link snapshotElements}. */
  clickElement(ref: number, tabId?: string): Promise<void>;
  /** Focus the input identified by `ref` and replace its value with `text`. */
  fillElement(ref: number, text: string, tabId?: string): Promise<void>;
  /** Dispatch a single named key (Enter, Tab, Escape, ArrowDown, …) to the focused element. */
  pressKey(key: string, tabId?: string): Promise<void>;
  /** Scroll the page up or down (`amount` in CSS px; host picks a sensible default). */
  scrollPage(direction: 'up' | 'down', amount?: number, tabId?: string): Promise<void>;
}
