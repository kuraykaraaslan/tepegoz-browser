import type { RawInteractable } from '@tepegoz/tool-executor';

/**
 * The browser operations the built-in agent tools need, abstracted away from Electron. The desktop app
 * implements this over its TabManager + WebContentsView; a headless/remote browser-agent could
 * implement it differently. Keeping the tools behind this seam is what lets the agent's capabilities
 * (`@tepegoz/ext-agent`'s `agentBuiltinCapabilities`) stay Electron-free.
 */
export interface BrowserHost {
  /** Navigate the active tab to `url` (scheme allow-list enforced by the host) and resolve once
   *  loading settles, with the final url + title. */
  navigateActive(url: string): Promise<{ url: string; title: string }>;
  /** Read the active page: its url, title, and the raw (unsanitized) visible text. */
  readActivePage(): Promise<{ url: string; title: string; text: string }>;
  /** List the open tabs. */
  listTabs(): { id: string; title: string; url: string }[];
  /** Open a new tab, optionally at a URL and inside a named group (agent tabs are grouped by task);
   *  returns its id. */
  createTab(url?: string, groupName?: string): string;
  /** Read the active page's actionable elements (accessibility tree). The host keeps the
   *  `ref → node` map for the action calls below, so `ref`s stay valid until the next snapshot. */
  snapshotElements(): Promise<{ url: string; title: string; elements: RawInteractable[] }>;
  /** Click the element identified by `ref` from the most recent {@link snapshotElements}. */
  clickElement(ref: number): Promise<void>;
  /** Focus the input identified by `ref` and replace its value with `text`. */
  fillElement(ref: number, text: string): Promise<void>;
  /** Dispatch a single named key (Enter, Tab, Escape, ArrowDown, …) to the focused element. */
  pressKey(key: string): Promise<void>;
  /** Scroll the page up or down (`amount` in CSS px; host picks a sensible default). */
  scrollPage(direction: 'up' | 'down', amount?: number): Promise<void>;
}

/** One audit event as exposed to the agent — a compact, already-redacted projection. */
export interface JournalEntry {
  type: string;
  ts: number;
  actor: string;
  correlationId: string;
  summary: string;
}

/**
 * Read seam over the append-only Event Journal, injected so the agent's built-in tools stay
 * Electron- and persistence-free. The desktop app implements it over `EventJournal` + the SQLite db.
 */
export interface JournalReader {
  /** Most recent events (newest first), optionally scoped to one run/correlationId. */
  recentEvents(limit: number, correlationId?: string): JournalEntry[];
}
