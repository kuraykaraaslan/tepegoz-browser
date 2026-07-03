import type { SelectorChain } from '@tepegoz/shared-types';

/**
 * The browser operations the deterministic interpreter needs, abstracted away from Electron (mirrors
 * how `@tepegoz/browser-tools` takes a `BrowserHost`). The desktop app implements this over the CDP
 * selector engine + `TabManager`, routing state-changing calls through the ToolGateway PEP. A fake
 * implementation drives the unit tests. Every element-targeting call performs **auto-wait** inside the
 * host (poll until resolve or timeout) — the interpreter never sleeps a fixed interval to "wait" for
 * an element (the core iMacros fix).
 */
export interface MacroHost {
  /** Navigate the active tab; resolve once loading settles. */
  navigate(url: string): Promise<void>;
  /** Resolve the chain (auto-wait) and click the first match. Throws if none resolves in time. */
  click(chain: SelectorChain): Promise<void>;
  /** Resolve the chain (auto-wait), focus, and replace the value with `value`. */
  fill(chain: SelectorChain, value: string): Promise<void>;
  /** Dispatch a single named key (Enter, Tab, …) to the focused element. */
  press(key: string): Promise<void>;
  scroll(direction: 'up' | 'down', amount?: number): Promise<void>;
  /** Resolve the chain (auto-wait) and read its text, or the named attribute if `attr` is given. */
  extract(chain: SelectorChain, attr?: string): Promise<string>;
  /** Poll until the chain resolves or `timeoutMs` elapses; resolves to whether it was found. */
  waitFor(chain: SelectorChain, timeoutMs: number): Promise<boolean>;
  /** Wait for the current page's navigation/load to settle (up to `timeoutMs`), then resolve. */
  waitForLoad(timeoutMs: number): Promise<void>;
  /** Whether the chain currently resolves to an element in the DOM (no long wait). */
  elementExists(chain: SelectorChain): Promise<boolean>;
  /** Whether the chain currently resolves to a *visible* element. */
  elementVisible(chain: SelectorChain): Promise<boolean>;
  /** Whether the page's visible text currently contains `text`. */
  pageContainsText(text: string): Promise<boolean>;
  /** Read a CSV blob (by content hash) into an array of row records keyed by header. */
  readCsv(blobHash: string): Promise<Record<string, string>[]>;
  /** Highlight the resolved element for record/replay UX (best-effort; may be a no-op). */
  highlight?(chain: SelectorChain): Promise<void>;
  /** Sleep `ms` (only used by the explicit `waitMs` step — never as an implicit element wait). */
  sleep(ms: number): Promise<void>;
}
