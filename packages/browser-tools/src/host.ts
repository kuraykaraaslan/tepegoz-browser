import type { RawInteractable } from '@tepegoz/tool-executor';
import type { NetworkObservation } from './network-verify';

/**
 * A JS dialog auto-declined, or a `beforeunload` prompt suppressed, on a tab (S3 PR4). Never a
 * page-principal `window.confirm`/`window.alert` override — always a main-process/native interception.
 */
export interface InterceptedDialog {
  /** 'dialog' = alert/confirm/prompt auto-declined via CDP; 'beforeunload' = a native unsaved-changes
   *  prompt suppressed so the tab is never silently stranded on it. */
  kind: 'dialog' | 'beforeunload';
  /** The dialog's own message (page-controlled — untrusted). Empty for `beforeunload`, which carries none. */
  message: string;
  /** Host-clock ms (`Date.now()`) — the SAME clock the action window is measured on. */
  ts: number;
}

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
  /**
   * Run a MODEL-AUTHORED extraction script against a copy of the page (S5).
   *
   * OPTIONAL, and its absence is a refusal rather than a degradation: a host that cannot provide the
   * proven sandbox must not fall back to running the script somewhere easier. `browser_analyze_page`
   * is simply not registered when this is missing.
   *
   * The host is responsible for the sandbox contract (no network, no page principal, a copy of the
   * DOM rather than the live one). See `extraction-sandbox.electron.ts` and the go/no-go spike.
   */
  runExtractionScript?(script: string, tabId?: string): Promise<unknown>;
  readArticleText?(
    tabId?: string,
  ): Promise<{ url: string; title: string; text: string; source: string }>;
  /**
   * Save a page as a PDF, into the browser's own download lifecycle.
   *
   * OPTIONAL, and its absence is a refusal rather than a degradation: a host that cannot route the
   * bytes through quarantine + hash + the release gate must not write a file somewhere easier.
   * `browser_save_pdf` is simply not registered when this is missing.
   *
   * The host returns a download ID and the filename it chose — never a path. The agent has no
   * filesystem, and handing it one would be the beginning of giving it one.
   */
  savePageAsPdf?(tabId?: string): Promise<{ downloadId: string; filename: string; bytes: number }>;
  /**
   * Every tab currently open, for tab-spawn detection (S3 PR3).
   *
   * A click that calls `window.open`, or a form with `target=_blank`, changes NOTHING on the acting
   * page: the agent has no way to learn that the answer it needs is now in a tab it does not know about.
   * Comparing this list either side of an interaction is what turns that invisible event into an
   * observation.
   *
   * OPTIONAL: a host that cannot enumerate tabs simply omits it, and no spawn is reported — never a
   * claim that no tab opened.
   */
  listOpenTabs?(): { id: string; url: string; title: string }[];
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
  ): Promise<{
    url: string;
    title: string;
    elements: RawInteractable[];
    /**
     * S10: share of the viewport covered by canvas/webgl/video — surface the DOM cannot describe.
     * Absent means **unknown**, never "there is no canvas": a host that cannot measure it must not be
     * read as evidence that the page is DOM-describable.
     */
    canvasFraction?: number | undefined;
  }>;
  /**
   * Click the element identified by `ref` from the most recent {@link snapshotElements}.
   *
   * `occludedBy` names what covers the element when EVERY probe point on it is blocked, and the click is
   * then NOT dispatched (S3 PR5): clicking through lands the gesture on the overlay, which is how a
   * cookie banner turns a working control into a silent no-op. Null means the click was sent.
   */
  clickElement(ref: number, tabId?: string): Promise<{ occludedBy: string | null }>;
  /**
   * Move the pointer over the element identified by `ref` and leave it there (S3 PR6).
   *
   * A `:hover` menu has no click handler and no focus rule, so its links are not in the actionable set
   * until the pointer is genuinely over the trigger — no other verb can reveal them.
   */
  hoverElement(ref: number, tabId?: string): Promise<void>;
  /**
   * Focus the input identified by `ref` and replace its value with `text`.
   *
   * `widget` is non-null when the field takes its value from its own widget (a `readonly` datepicker, an
   * ARIA combobox with a popup) or cannot take one at all (`disabled`) — in which case NOTHING was typed
   * (S3 PR7). Typing into such a field does nothing, and a fill that "succeeds" into a field the page
   * ignores is the most expensive false success there is: the agent then submits a form it never filled.
   */
  fillElement(
    ref: number,
    text: string,
    tabId?: string,
  ): Promise<{ widget: 'readonly' | 'disabled' | 'combobox' | null }>;
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
   * S6 PR6 — the credential broker's fill. **The agent never receives a secret.**
   *
   * It asks for a *field* to be filled on a *ref*; main reads the origin from the live tab, matches a
   * stored credential by eTLD+1, gates on OS auth, and types the value in itself. The result says
   * whether it happened and where — never the value, the username, or even its length.
   *
   * OPTIONAL: a host with no vault or no OS-auth gate simply omits it, and the tool is not registered.
   * There is no configuration in which this fills without the user present.
   */
  fillCredential?(
    ref: number,
    field: 'username' | 'password',
    tabId?: string,
  ): Promise<{ filled: boolean; field: 'username' | 'password'; origin: string; reason?: string }>;
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
  scrollToText(
    text: string,
    nth?: number,
    tabId?: string,
  ): Promise<{ found: boolean; count: number }>;
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
  /**
   * Dialogs/`beforeunload` prompts intercepted on `tabId` at or after `sinceMs` (S3 PR4) — an
   * auto-declined `window.confirm`/`alert`/`prompt`, or a suppressed unsaved-changes prompt that would
   * otherwise strand the run on a native OS dialog no DOM action can dismiss.
   *
   * OPTIONAL: a host that cannot observe this simply omits it, and no interception is ever reported —
   * never a claim that nothing happened. An empty array means the same: "nothing observed", not "nothing
   * happened".
   */
  interceptionsSince?(sinceMs: number, tabId?: string): Promise<InterceptedDialog[]>;
}
