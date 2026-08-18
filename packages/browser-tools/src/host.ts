import type { RawInteractable } from '@tepegoz/tool-executor';
import type { NetworkObservation } from './network-verify';

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
  /** Read a page: its url, title, the raw (unsanitized) visible text, and `sig` — a compact structural
   *  signature of the currently VISIBLE actionable elements. `sig` lets an in-place interaction (opening a
   *  drawer/menu/dropdown, swapping a tab panel) register as a change even when url/title/innerText do not
   *  move, so `browser_update_page` never mis-reports such a click as a no-op. */
  readPage(tabId?: string): Promise<{ url: string; title: string; text: string; sig: string }>;
  /**
   * Read a page's ARTICLE text: the content root the page itself declares (`article`/`main`/`[role=main]`),
   * with navigation, headers, footers and asides removed. `source` names the root that was used, or
   * `'body'` when no candidate was convincing — so a caller is never left guessing whether it got an
   * article or the whole page.
   *
   * OPTIONAL: a host that cannot do content extraction simply omits it, and `browser_get_page_text`
   * degrades to the same text `readPage` returns, labelled `'body'`. Never silently pretend to have
   * extracted an article.
   */
  readArticleText?(
    tabId?: string,
  ): Promise<{ url: string; title: string; text: string; source: string }>;
  /** Wait for a page's current load to settle. */
  waitForLoad(tabId?: string, timeoutMs?: number): Promise<{ url: string; title: string }>;
  /**
   * Move a tab through its own history, or reload it (S3 PR1). `moved` is false when there was nowhere
   * to go — the honest answer for "back" at the start of a session, and the one thing a URL comparison
   * cannot tell you, because a same-URL back step and a no-op look identical afterwards.
   */
  historyGo(
    direction: 'back' | 'forward' | 'reload',
    tabId?: string,
  ): Promise<{ url: string; title: string; moved: boolean }>;
  /**
   * Wait until a condition holds, bounded by an explicit timeout (S3 PR1). Never an unbounded spin:
   * `satisfied: false` after `waitedMs` is a truthful result, not an error, so the model can decide
   * whether to wait again or act.
   *
   * - `text` — the visible page text contains `value`.
   * - `selector` — a node matching the CSS `value` is present AND rendered.
   * - `network_idle` — no in-flight requests for a short quiet period.
   */
  waitForCondition(
    condition: { kind: 'text' | 'selector' | 'network_idle'; value?: string; timeoutMs: number },
    tabId?: string,
  ): Promise<{ satisfied: boolean; waitedMs: number }>;
  /**
   * Read a page's actionable elements. The host keeps the `ref → node` map for the action calls below, so
   * `ref`s stay valid until the next snapshot.
   *
   * `opts.viewportExpansionPx` grows the in-viewport test by that many CSS px on every edge (default 0 =
   * strictly on-screen). A whole-form check (AI-4 `s16`) passes a large expansion so required fields below
   * the fold are still emitted; normal actionable-element perception keeps the default.
   */
  snapshotElements(
    tabId?: string,
    opts?: { viewportExpansionPx?: number },
  ): Promise<{ url: string; title: string; elements: RawInteractable[] }>;
  /**
   * Click the element identified by `ref` from the most recent {@link snapshotElements}.
   *
   * `occludedBy` names what covers the element when EVERY probe point on it is blocked, and the click is
   * then NOT dispatched (S3 PR5): clicking through lands the gesture on the overlay, which is how a
   * cookie banner turns a working control into a silent no-op. Null means the click was sent.
   */
  clickElement(ref: number, tabId?: string): Promise<{ occludedBy: string | null }>;
  /** Focus the input identified by `ref` and replace its value with `text`. */
  fillElement(ref: number, text: string, tabId?: string): Promise<void>;
  /**
   * The current value of the form control at `ref` (from the latest {@link snapshotElements}), or `null`
   * when the element has no value semantics or can no longer be read.
   *
   * Exists so a `fill` can be **verified** rather than assumed: typing into an input moves neither the
   * page text nor the structural signature (`sig` excludes `el.value` by design), so the generic
   * page-delta check reports a successful fill as `changed: false`. Measured on the AI-1 harness, that
   * sent the agent into re-filling the same box. Must NOT re-snapshot — existing refs stay valid.
   */
  readElementValue(ref: number, tabId?: string): Promise<string | null>;
  /**
   * Dispatch a single named key (Enter, Tab, Escape, ArrowDown, …) to the focused element. A thin alias
   * for {@link sendKeys} with one step — an unsupported key is REPORTED, never thrown (S3 PR2).
   */
  pressKey(key: string, tabId?: string): Promise<{ sent: number; unsupported: string[] }>;
  /**
   * Dispatch a chord or a sequence of chords (`Ctrl+A`, `Shift+Tab`, `Ctrl+A Delete`).
   *
   * Every step that can be sent IS sent; the rest come back in `unsupported`. A keystroke this transport
   * cannot express is a fact to report, not a reason to end a step — the agent can nearly always reach
   * the same goal another way if it is simply told what did not happen.
   */
  sendKeys(keys: string, tabId?: string): Promise<{ sent: number; unsupported: string[] }>;
  /** Scroll the page up or down (`amount` in CSS px; host picks a sensible default). */
  scrollPage(direction: 'up' | 'down', amount?: number, tabId?: string): Promise<void>;
  /** Content-addressed reveal: bring the `nth` (1-based, default 1) on-page occurrence of `text` into
   *  view so it enters the element index map. Deterministic (uses the browser's native find), searches
   *  same-origin frames, and explicitly scrolls the match to centre. Resolves `{ found, count }` where
   *  `count` is how many occurrences were located (≤ nth) — so a shortfall (`count < nth`) is honest
   *  rather than reported as "no match". The primitive for targets that aren't yet in view. */
  scrollToText(text: string, nth?: number, tabId?: string): Promise<{ found: boolean; count: number }>;
  /** Choose an `<option>` in the native `<select>` at `ref`, matching `value` against option text or
   *  value (exact → diacritic-insensitive → substring) and firing `input`+`change` so page scripts react.
   *  A native select opens an OS popup that DOM clicks can't drive, so this is the deterministic way to
   *  set one. Resolves the matched option's label (or `null` when nothing matched) plus the full option
   *  list — so on a miss the agent can retry with an exact label it can now see. */
  selectOption(
    ref: number,
    value: string,
    tabId?: string,
  ): Promise<{ selected: string | null; options: string[] }>;
  /**
   * HTTP responses the host observed on `tabId` at or after `sinceMs` (host clock, `Date.now()`) —
   * AI-8B post-action verification. Used to catch a **silent** non-2xx (a Save whose POST returns 403
   * while the UI shows nothing), which no DOM-level delta can see.
   *
   * An empty array means **nothing was observed**, NOT "everything succeeded" — a host that does not
   * observe the network (or a tab it is not attached to) returns empty, so callers must never turn this
   * into a positive success claim. See `describeNetworkFailures`.
   */
  networkSince(sinceMs: number, tabId?: string): Promise<NetworkObservation[]>;
}
