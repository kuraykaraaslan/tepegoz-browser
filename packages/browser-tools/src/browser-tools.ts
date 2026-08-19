import { z } from 'zod';
import { CapabilityRegistry } from '@tepegoz/capability-plane';
import {
  checkForm,
  sanitizeContent,
  wrapUntrustedContent,
  MAX_INTERACTABLE_ELEMENTS,
  MAX_SCRIPT_CHARS,
  acceptScript,
  capResult,
} from '@tepegoz/tool-executor';
import { CredentialFillIntentSchema, type ToolDescriptor } from '@tepegoz/shared-types';
import { buildElementsSnapshot, buildPageSnapshot, type ElementsDiffMemory } from './perception';
import { describeNetworkFailures, selectActionFailures } from './network-verify';
import type { BrowserHost } from './host';

/**
 * The agent's built-in **`browser_*` capabilities** — read the page, navigate a tab, snapshot
 * actionable elements, and perform one interaction (click/fill/press/scroll). Registered directly into
 * the single `CapabilityRegistry` behind the ToolGateway PEP as always-on `source: 'builtin'` tools
 * (the `@tepegoz/file-operations` pattern), bound to an injected {@link BrowserHost} so this package
 * stays Electron-free. Moved off the Agent extension (ADR-0021/0024 update): these are browser-domain
 * operations, not agent-owned, and no longer vanish when `com.tepegoz.agent` is disabled.
 */

const TargetTabArgs = z.object({ tabId: z.string().min(1).max(128).optional() }).strip();
const NavigateArgs = TargetTabArgs.extend({ url: z.string().min(1).max(4096) });
/** S5: the script bound is enforced twice — here at the boundary, and again by `acceptScript`. */
const ExtractionArgs = TargetTabArgs.extend({
  script: z.string().min(1).max(MAX_SCRIPT_CHARS),
});
const ValidatePageArgs = TargetTabArgs.extend({
  containsText: z.string().min(1).max(500).optional(),
  timeoutMs: z.number().int().positive().max(60_000).optional(),
});
const HistoryArgs = TargetTabArgs.extend({ direction: z.enum(['back', 'forward', 'reload']) });
const WaitConditionArgs = TargetTabArgs.extend({
  condition: z.enum(['text', 'selector', 'network_idle']),
  value: z.string().min(1).max(500).optional(),
  // Bounded by the schema as well as by the host: an unbounded wait is the failure mode this verb exists
  // to remove, and a 10-minute "wait" would just be a hang with a nicer name.
  timeoutMs: z.number().int().positive().max(30_000).optional(),
});
// Coerce so a weak model that sends the ref as a string ("2") still validates — same value space, one
// fewer way for the JSON-in-text decision path to trip on a shape nit. Non-numeric strings still reject.
const Ref = z.coerce.number().int().positive().max(10_000);
/** One page interaction, discriminated by `action` so each variant validates its own args. */
const UpdatePageArgs = z.discriminatedUnion('action', [
  TargetTabArgs.extend({ action: z.literal('click'), ref: Ref }),
  TargetTabArgs.extend({ action: z.literal('hover'), ref: Ref }),
  TargetTabArgs.extend({ action: z.literal('fill'), ref: Ref, text: z.string().max(10_000) }),
  TargetTabArgs.extend({ action: z.literal('press'), key: z.string().min(1).max(40) }),
  TargetTabArgs.extend({ action: z.literal('send_keys'), keys: z.string().min(1).max(200) }),
  TargetTabArgs.extend({
    action: z.literal('scroll'),
    direction: z.enum(['up', 'down']),
    amount: z.number().int().positive().max(100_000).optional(),
  }),
  TargetTabArgs.extend({
    action: z.literal('scroll_to_text'),
    text: z.string().min(1).max(500),
    nth: z.number().int().positive().max(50).optional(),
  }),
  TargetTabArgs.extend({
    action: z.literal('select_option'),
    ref: Ref,
    // The option to choose, by label or value. Accept the common aliases a model reaches for (`text`,
    // `option`, `label`) so a natural arg name doesn't hard-fail validation; resolved in the handler.
    value: z.string().min(1).max(1000).optional(),
    text: z.string().min(1).max(1000).optional(),
    option: z.string().min(1).max(1000).optional(),
    label: z.string().min(1).max(1000).optional(),
  }),
]);

/** The option label/value a select_option call wants, tolerating the aliases above. */
function selectOptionValue(args: {
  value?: string | undefined;
  text?: string | undefined;
  option?: string | undefined;
  label?: string | undefined;
}): string | undefined {
  return args.value ?? args.text ?? args.option ?? args.label;
}

interface PageFingerprint {
  url: string;
  title: string;
  text: string;
  /** Structural signature of the VISIBLE actionable elements (host-computed). Catches state changes an
   *  in-place SPA toggle makes that leave url/title/innerText untouched — a drawer/menu/dropdown/accordion
   *  sliding into view, a tab panel swapping, a modal opening — where the revealed nodes already lived in
   *  the DOM (so `innerText` never moved) but were off-canvas/hidden until the interaction. */
  sig: string;
}

/** Did the interaction move the page? True on any url/title/visible-text change OR a change to the
 *  visible actionable-element set. The structural arm is what stops a menu-toggle click from reading as a
 *  no-op (the false `changed:false` that used to drive the agent into a re-click loop). */
function pageChanged(before: PageFingerprint, after: PageFingerprint): boolean {
  return (
    before.url !== after.url ||
    before.title !== after.title ||
    before.text !== after.text ||
    before.sig !== after.sig
  );
}

/** A change the structural signature caught but url/title/visible-text did not — i.e. the actionable set
 *  moved (a menu/panel opened) with no new visible prose. The model must re-read elements to see it. */
function structuralOnlyChange(before: PageFingerprint, after: PageFingerprint): boolean {
  return (
    before.sig !== after.sig &&
    before.url === after.url &&
    before.title === after.title &&
    before.text === after.text
  );
}

/** Result for a `select_option`: on a miss, surface the real option list so the model retries with an
 *  exact label rather than falling back to clicking the native (OS-popup) select. */
function selectOptionResult(
  value: string | undefined,
  selected: string | null | undefined,
  optionLabels: string[] | undefined,
  after: { url: string; title: string },
  changed: boolean,
): { ok: true; url: string; title: string; changed: boolean; recoveryHint?: string; note?: string } {
  if (value === undefined) {
    return {
      ok: true,
      url: after.url,
      title: after.title,
      changed,
      recoveryHint:
        'select_option needs the option to choose — pass it as "value" (the option label or its value).',
    };
  }
  if (selected === null || selected === undefined) {
    const opts = (optionLabels ?? []).filter((o) => o.length > 0).join(', ');
    return {
      ok: true,
      url: after.url,
      title: after.title,
      changed,
      recoveryHint:
        `No option matching "${value}" in that dropdown.` +
        (opts.length > 0 ? ` Available options: ${opts}.` : '') +
        ' Call select_option again with one of the exact labels.',
    };
  }
  return { ok: true, url: after.url, title: after.title, changed, note: `Selected "${selected}" in the dropdown.` };
}

/** Viewport expansion (CSS px per edge) used by the whole-form check, so a required field below the fold
 *  is still inspected. Large enough for a normal long form without asking for the entire document. */
const WHOLE_PAGE_EXPANSION_PX = 20_000;

/** What `browser_update_page` reports back for one interaction. */
interface InteractionResult {
  ok: true;
  url: string;
  title: string;
  changed: boolean;
  recoveryHint?: string;
  note?: string;
  found?: boolean;
  /** `fill` only: whether the field verifiably holds the requested text. Absent = not a fill, or the
   *  value could not be read back (reported as UNVERIFIED, never as success). */
  filled?: boolean;
  /** `press`/`send_keys` only: chords this transport could not express, so they never reached the page. */
  unsupportedKeys?: string[];
  /** `click` only: what covered the target. Present ⇒ the click was refused, not sent. */
  occludedBy?: string;
  /** Tabs this interaction opened. Present ⇒ act on them by `tabId`, and come back when done. */
  openedTabs?: { id: string; url: string; title: string }[];
  /** `fill` only: the field is widget-driven or disabled, so NOTHING was typed (S3 PR7). */
  fillRefused?: 'readonly' | 'disabled' | 'combobox';
  /** AI-8B: set only when a request sent during this interaction failed. Absent means "nothing was
   *  observed", never "everything succeeded". */
  networkWarning?: string;
}

/** Longest field value quoted back to the model, and the sanitizing pass every page-controlled string
 *  makes before it enters a prompt (a page script can rewrite an input's value on `input`). */
const MAX_QUOTED_VALUE = 120;
function safeValue(raw: string): string {
  const { text } = sanitizeContent(raw);
  return text.replace(/["'\r\n]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_QUOTED_VALUE);
}

/** Everything the post-action reporting rules need about one completed interaction. */
interface InteractionContext {
  before: PageFingerprint;
  after: PageFingerprint;
  changed: boolean;
  /** True when a request sent during this interaction failed (AI-8B). Flips the no-change advice from
   *  "try a different ref" — which is actively wrong here, the interaction DID reach the server — to
   *  "the request was rejected". */
  networkFailed: boolean;
  found: boolean | undefined;
  matchCount: number | undefined;
  selected: string | null | undefined;
  optionLabels: string[] | undefined;
  /** `fill` only: the field's value read back after the fill; `null` when it could not be read. */
  fieldValue: string | null | undefined;
  /** Chords the transport could not express (`press`/`send_keys`). */
  unsupportedKeys?: string[] | undefined;
  /** `click` only: what covered the target, when the click was refused rather than sent. */
  occludedBy?: string | null | undefined;
  /** Tabs that appeared during this interaction (S3 PR3). */
  spawnedTabs?: { id: string; url: string; title: string }[] | undefined;
  /** `fill` only: the widget kind that refused the typed value (S3 PR7). */
  fillWidget?: 'readonly' | 'disabled' | 'combobox' | null | undefined;
}

/**
 * A fill's success is whether the FIELD now holds the text — never the page delta.
 *
 * Typing into an input moves neither `innerText` nor the structural signature (`sig` excludes `el.value`
 * by design, so a live clock cannot flip it), so `pageChanged` is false for a fill that WORKED and the
 * generic no-change branch told the model to "try a different ref". Measured on the AI-1 harness
 * (`silent_api_failure`, live gpt-4o): the agent re-filled the same box across five wasted steps, each
 * time reasoning that "the previous attempt showed no visible change".
 */
/**
 * A fill that was REFUSED because the field is widget-driven (S3 PR7).
 *
 * The point is not to fail politely — it is to stop the agent believing a form is filled. It says
 * nothing was typed, and names the only route that works: operate the widget.
 */
function widgetFillResult(
  widget: 'readonly' | 'disabled' | 'combobox',
  ctx: InteractionContext,
): InteractionResult {
  const { after } = ctx;
  const why =
    widget === 'disabled'
      ? 'that field is disabled, so it cannot take a value at all'
      : widget === 'readonly'
        ? 'that field is read-only — its value is set by its own widget (a calendar, picker or list), not by typing'
        : 'that field is a combobox whose value comes from its popup list, not from typing';
  return {
    ok: true,
    url: after.url,
    title: after.title,
    changed: false,
    filled: false,
    fillRefused: widget,
    recoveryHint:
      `NOTHING was typed: ${why}. ` +
      (widget === 'disabled'
        ? 'Do whatever the page requires to enable it first (often another field or a checkbox), then re-read.'
        : 'Click the field to open its widget, re-read browser_get_elements, then CLICK the option you want ' +
          '(e.g. the day in the calendar). A value typed in would be ignored, and the form would submit empty.'),
  };
}

function fillResult(text: string, ctx: InteractionContext): InteractionResult {
  const { after, changed, fieldValue } = ctx;
  const base = { ok: true as const, url: after.url, title: after.title, changed };
  if (fieldValue === null || fieldValue === undefined) {
    // Unreadable (not a form control, or the ref went stale). Claiming either outcome would be a guess.
    return {
      ...base,
      note:
        'The field value could not be read back, so this fill is UNVERIFIED — it may or may not have ' +
        'taken. Re-read browser_get_elements and check the element value before assuming anything.',
    };
  }
  if (fieldValue === text) {
    return {
      ...base,
      filled: true,
      note:
        'The field now holds exactly the text you sent (verified by reading it back). A fill never ' +
        'changes page text or structure, so changed=false here is EXPECTED and not a failure — do not ' +
        'fill it again; move on to the next step.',
    };
  }
  return {
    ...base,
    filled: false,
    recoveryHint:
      `After the fill the field holds "${safeValue(fieldValue)}" instead of the text you sent. ` +
      'The page may have reformatted it (an input mask) — if that value is equivalent, continue; ' +
      'otherwise the field may be read-only or controlled by a script, so try a different approach ' +
      'rather than repeating the same fill.',
  };
}

/** The `scroll_to_text` reveal's result: its meaningful outcome is `found`, not the structural delta. */
function scrollToTextResult(
  nthRequested: number,
  ctx: InteractionContext,
): InteractionResult {
  const { after, changed, found, matchCount } = ctx;
  if (found !== true) {
    return {
      ok: true,
      url: after.url,
      title: after.title,
      changed,
      found: false,
      recoveryHint:
        'No matching text was found on the page. Try fewer or different words, or scroll and re-read; use browser_get_page to see what text is actually present.',
    };
  }
  // Honest shortfall: fewer occurrences than the requested `nth` exist. Report it rather than claiming
  // success on the nth — the page is scrolled to the LAST (count-th) occurrence.
  const note =
    matchCount !== undefined && matchCount < nthRequested
      ? `Found only ${String(matchCount)} occurrence(s) of that text (fewer than the ${String(nthRequested)} requested) and scrolled to the last one. Re-read browser_get_elements to act on it.`
      : 'Scrolled the matching text into view. Re-read browser_get_elements to act on the now-visible controls.';
  return { ok: true, url: after.url, title: after.title, changed, found: true, note };
}

/** Per-action reporting rules, split out so the handler stays a thin perceive→act→verify sequence. */
/**
 * Report a keystroke honestly (S3 PR2). A key this transport cannot express used to raise a 400 and end
 * the step; it is now a normal result carrying `unsupportedKeys`, because the agent can usually reach
 * the same goal another way — but only if it is told which keystrokes never landed.
 */
function keysResult(ctx: InteractionContext): InteractionResult {
  const { after, changed } = ctx;
  const unsupported = ctx.unsupportedKeys ?? [];
  if (unsupported.length === 0) {
    return { ok: true, url: after.url, title: after.title, changed };
  }
  return {
    ok: true,
    url: after.url,
    title: after.title,
    changed,
    unsupportedKeys: unsupported,
    recoveryHint:
      `These keystrokes could not be sent: ${unsupported.join(', ')}. ` +
      'Use a named key (Enter, Tab, Escape, Backspace, Delete, Arrow*, Home, End, PageUp, PageDown, ' +
      'Space), a single character, or a chord over one of those (e.g. "Ctrl+A") — or reach the same ' +
      'result by clicking a control instead.',
  };
}

function interactionResult(
  args: z.infer<typeof UpdatePageArgs>,
  ctx: InteractionContext,
): InteractionResult {
  return withSpawnedTabs(interactionResultBody(args, ctx), ctx.spawnedTabs ?? []);
}

/**
 * Fold a tab spawned by this interaction into the result (S3 PR3).
 *
 * The acting page does not change when a click calls `window.open` or a form submits with
 * `target=_blank`, so without this the agent reads "nothing happened" and either repeats the click or
 * gives up — while the answer it needs sits in a tab it has never heard of.
 *
 * It is REPORTED, not auto-followed. An attacker-controlled `window.open` is exactly the escape vector
 * the phase's own risk list names, and an unconditional follow would walk straight into it. The model
 * decides, with the tab's id in hand, and the ToolGateway still gates whatever it does next.
 */
function withSpawnedTabs(
  result: InteractionResult,
  spawned: { id: string; url: string; title: string }[],
): InteractionResult {
  if (spawned.length === 0) return result;
  const named = spawned
    .map((t) => `${t.id} ("${safeValue(t.title)}" — ${safeValue(t.url)})`)
    .join(', ');
  const note =
    `This action opened a NEW TAB: ${named}. The page you acted on did not change because the result ` +
    'went there. Pass that id as `tabId` to browser_get_page / browser_get_elements / ' +
    'browser_update_page to work in it, and come back to this tab when you are done.';
  return {
    ...result,
    openedTabs: spawned,
    note: result.note === undefined ? note : `${result.note} ${note}`,
  };
}

function interactionResultBody(
  args: z.infer<typeof UpdatePageArgs>,
  ctx: InteractionContext,
): InteractionResult {
  const { before, after, changed } = ctx;
  if (args.action === 'select_option') {
    return selectOptionResult(selectOptionValue(args), ctx.selected, ctx.optionLabels, after, changed);
  }
  if (args.action === 'scroll_to_text') return scrollToTextResult(args.nth ?? 1, ctx);
  if (args.action === 'press' || args.action === 'send_keys') return keysResult(ctx);
  // A hover that revealed nothing is not a failure to repeat differently — some menus need the pointer to
  // rest, and some triggers are simply not hover-driven. Say what happened and let the model re-read.
  if (args.action === 'hover') {
    return {
      ok: true,
      url: after.url,
      title: after.title,
      changed,
      note: changed
        ? 'Hovering revealed new content — re-read browser_get_elements to see and act on it.'
        : 'The pointer is now over that element but nothing changed. It may not be a hover trigger; try clicking it instead.',
    };
  }
  if (args.action === 'click' && ctx.occludedBy !== null && ctx.occludedBy !== undefined) {
    return {
      ok: true,
      url: after.url,
      title: after.title,
      changed: false,
      occludedBy: ctx.occludedBy,
      recoveryHint:
        `That element is covered by ${ctx.occludedBy}, so the click was NOT sent — clicking anyway would ` +
        'have hit the overlay, not your target. Dismiss or close the covering element first (accept/reject ' +
        'a consent banner, close a modal, or scroll it out of the way), then re-read browser_get_elements ' +
        'and click again.',
    };
  }
  if (args.action === 'fill') {
    const widget = ctx.fillWidget;
    if (widget !== null && widget !== undefined) return widgetFillResult(widget, ctx);
    return fillResult(args.text, ctx);
  }
  // A scroll's effect is a viewport move, not a content/state change. Report `changed` plainly and skip
  // BOTH the structural "a menu opened — do NOT repeat" note (false: scrolling changes the in-viewport
  // actionable set by design, and scrolling again is a normal way to reach content) and the "no change"
  // recovery hint. The model re-reads elements next to see what scrolled into view.
  if (args.action === 'scroll') return { ok: true, url: after.url, title: after.title, changed };
  if (!changed) {
    return {
      ok: true,
      url: after.url,
      title: after.title,
      changed,
      recoveryHint: ctx.networkFailed
        ? // The interaction was NOT a miss: it reached the server, which rejected it. Steering the model to
          // "try a different ref" here is the wrong repair and burns steps on a working control.
          'The page did not change, but a request sent by this interaction failed (see networkWarning) — ' +
          'so the control DID work and the server rejected the request. Do not just try another ref: read ' +
          'the page for an error message, fix the underlying problem, or report the failure.'
        : 'No visible or structural change was detected. Re-read browser_get_elements and try a different ref; if the target may be off-screen, scroll (or use scroll_to_text) and re-read.',
    };
  }
  // Structural-only: the actionable set moved (a menu/drawer/panel opened) but no new prose appeared.
  // Tell the model so it re-reads elements and acts on the newly revealed controls instead of assuming
  // its click failed and repeating it — the exact loop this signal is here to break.
  if (structuralOnlyChange(before, after)) {
    return {
      ok: true,
      url: after.url,
      title: after.title,
      changed,
      note: 'The set of actionable elements changed (e.g. a menu/drawer/panel opened) with no new page text. Re-read browser_get_elements and act on the newly revealed controls — do NOT repeat this interaction.',
    };
  }
  return { ok: true, url: after.url, title: after.title, changed };
}

/**
 * AI-8B: the warning for requests that failed inside this action's window, or `undefined` when none did.
 *
 * Never throws and never claims success — a host that cannot observe the network, or an error while
 * asking it, degrades to `undefined` (= "nothing to report"), which is exactly how absence must read.
 */
async function networkWarning(
  host: BrowserHost,
  tabId: string | undefined,
  sinceMs: number,
  pageUrl: string,
): Promise<string | undefined> {
  try {
    const observations = await host.networkSince(sinceMs, tabId);
    return describeNetworkFailures(selectActionFailures(observations, pageUrl), pageUrl);
  } catch {
    return undefined;
  }
}

/** Build a `browser_*` builtin ToolDescriptor (mirrors `@tepegoz/file-operations`'s local helper). */
function descriptor(
  id: string,
  dangerClass: ToolDescriptor['dangerClass'],
  description: string,
  opts: { aiTask?: ToolDescriptor['aiTask']; capability?: ToolDescriptor['capability'] } = {},
): ToolDescriptor {
  return {
    id,
    description,
    dangerClass,
    source: 'builtin',
    inputSchema: { type: 'object' },
    requiresIdempotencyKey: false,
    aiTask: opts.aiTask ?? 'none',
    category: 'browser',
    ...(opts.capability !== undefined ? { capability: opts.capability } : {}),
  };
}

/** Registers the `browser_*` agent tools into the `CapabilityRegistry`, bound to `deps.host`. */
export function registerBrowserTools(deps: { host: BrowserHost }): void {
  const { host } = deps;

  /**
   * What the model was last shown per tab, so the next listing can send only what moved (S2 PR2).
   * Lives in this closure because the tool handler is the only place that knows both the tabId and what
   * was rendered. Bounded by the number of tabs a run touches, and each entry is dropped the moment the
   * tab's URL changes (a ref from another page addresses nothing here).
   */
  const diffMemory = new Map<string, ElementsDiffMemory>();
  const ACTIVE_TAB = '<active>';

  CapabilityRegistry.register({
    descriptor: descriptor(
      'browser_get_page',
      'read',
      'Read the visible text of a page. args: { tabId?: string } — omit tabId for the active tab. ' +
        'Returns { url, title, content }.',
      { aiTask: 'read_understand' },
    ),
    inputSchema: TargetTabArgs,
    handler: async (args) => {
      const { url, title, text } = await host.readPage(args.tabId);
      return buildPageSnapshot(text, url, title);
    },
  });

  CapabilityRegistry.register({
    descriptor: descriptor(
      'browser_get_article',
      'read',
      "Read a page's ARTICLE text — the main content with navigation, headers, footers and sidebars " +
        'removed. args: { tabId?: string } — omit tabId for the active tab. Returns ' +
        '{ url, title, content, source }. Prefer this over browser_get_page when you want to READ or ' +
        'summarise a page; `source` names the content root that was used, and `source: "body"` means no ' +
        'article was found and this is the whole page. Use browser_get_page when you need every visible ' +
        'string (including nav and banners), and browser_get_elements to ACT on the page.',
      { aiTask: 'read_understand' },
    ),
    inputSchema: TargetTabArgs,
    handler: async (args) => {
      // A host without content extraction degrades to the same text browser_get_page returns, labelled
      // 'body' — never a silent claim that an article was extracted when it was not.
      const page =
        host.readArticleText === undefined
          ? { ...(await host.readPage(args.tabId)), source: 'body' }
          : await host.readArticleText(args.tabId);
      return { ...buildPageSnapshot(page.text, page.url, page.title), source: page.source };
    },
  });

  // S5: model-authored extraction. Registered ONLY when the host can provide the proven sandbox —
  // a missing sandbox means no tool, never a script run somewhere more convenient.
  if (host.runExtractionScript !== undefined) {
    const runScript = host.runExtractionScript.bind(host);
    CapabilityRegistry.register({
      descriptor: descriptor(
        'browser_analyze_page',
        'read',
        'Run a small JavaScript expression over a COPY of the page and return what it evaluates to. args: { script: string, tabId?: string }. Use this to pull many values at once — every row of a table, every price in a list — instead of clicking through them one at a time. The script runs against a snapshot in a sandbox with no network and no access to the real page: it can read the DOM (querySelectorAll, textContent, attributes) and MUST NOT try to change the page, store anything, or fetch anything. Return a string or an array of strings. Results are capped and will say so when truncated.',
        { aiTask: 'read_understand', capability: 'code_exec_read' },
      ),
      inputSchema: ExtractionArgs,
      handler: async (args) => {
        const accepted = acceptScript(args.script);
        // A refusal is RETURNED, not thrown: the model wrote this script and can rewrite it, so the
        // reason is more useful to it than an error is to the run.
        if (!accepted.ok) return { refused: accepted.reason, content: '' };
        // The hash reaches the journal through the tool result; the BODY never does. A
        // model-authored script is composed from page content, so logging it verbatim would copy an
        // injection payload into the audit record.
        const raw = await runScript(accepted.script, args.tabId);
        const capped = capResult(raw);
        return {
          scriptHash: accepted.hash,
          content: capped.value,
          truncated: capped.truncated,
          ...(capped.items !== undefined ? { items: capped.items } : {}),
        };
      },
    });
  }

  CapabilityRegistry.register({
    descriptor: descriptor(
      'browser_update_location',
      'state_changing',
      'The DEFAULT way to open a page: navigate a tab to a web URL (reuses the tab). ' +
        'args: { url: string, tabId?: string } — omit tabId for the active tab. Returns { url, title }.',
    ),
    inputSchema: NavigateArgs,
    handler: (args) => host.navigate(args.url, args.tabId),
  });

  CapabilityRegistry.register({
    descriptor: descriptor(
      'browser_get_elements',
      'read',
      "Read a page's actionable elements (buttons, links, inputs) from the accessibility " +
        'tree. args: { tabId?: string } — omit tabId for the active tab. Returns ' +
        '{ url, title, elements: [{ ref, role, name, value?, disabled? }], content }. ' +
        "Use each element's `ref` with browser_update_page to click or fill it. Re-read after any " +
        'navigation or page change — refs are only valid for the latest snapshot. ' +
        "A collapsed menu/drawer's items are NOT listed until it is open — click its menu/hamburger " +
        'toggle (or scroll), then re-read.',
      { aiTask: 'read_understand' },
    ),
    inputSchema: TargetTabArgs,
    handler: async (args) => {
      const { url, title, elements, canvasFraction } = await host.snapshotElements(args.tabId);
      const key = args.tabId ?? ACTIVE_TAB;
      const snapshot = buildElementsSnapshot(elements, url, title, diffMemory.get(key), canvasFraction);
      diffMemory.set(key, snapshot.memory);
      return snapshot;
    },
  });

  CapabilityRegistry.register({
    descriptor: descriptor(
      'browser_validate_form',
      'read',
      'Pre-submit form check (AI-4 s16). Call this BEFORE clicking a submit/save/sign-up button to catch ' +
        'problems that would silently fail the submission. args: { tabId?: string } — omit tabId for the ' +
        'active tab. Returns { ok, coverage, content, requiredEmpty, flaggedInvalid, visibleErrors }. ' +
        'BLOCKING: requiredEmpty (fill those, then re-check). ADVISORY only: flaggedInvalid and ' +
        'visibleErrors — a page usually sets those on a failed submit and refreshes them on the NEXT one, ' +
        'so they may be left over from an earlier attempt; do not loop on them once the fields are correct. ' +
        'If coverage is "partial" the check could NOT see every field — scroll through the form and verify ' +
        'the rest yourself instead of treating it as a green light. NOTE: this re-reads the page, so element ' +
        'refs are refreshed — use the refs from THIS report, and re-read browser_get_elements before acting ' +
        'on refs from an older listing.',
      { aiTask: 'read_understand' },
    ),
    inputSchema: TargetTabArgs,
    handler: async (args) => {
      // Widen the viewport test so required fields BELOW THE FOLD are inspected too: a clean result from a
      // viewport-only snapshot would be exactly the false "OK to submit" this tool exists to prevent.
      const [{ url, title, elements }, page] = await Promise.all([
        host.snapshotElements(args.tabId, { viewportExpansionPx: WHOLE_PAGE_EXPANSION_PX }),
        host.readPage(args.tabId),
      ]);
      const snapshot = buildElementsSnapshot(elements, url, title);
      // Only claim full coverage when the snapshot was not truncated by the element cap; `checkForm`
      // independently degrades to `partial` when no validation constraints were captured at all (e.g. the
      // accessibility-tree fallback, which carries no attributes).
      const truncated = snapshot.elements.length >= MAX_INTERACTABLE_ELEMENTS;
      const report = checkForm(snapshot.elements, page.text, {
        coverage: truncated ? 'partial' : 'complete',
      });
      // The report embeds page-controlled labels/error text, so it crosses the AI-5 boundary exactly like
      // every other page read: injection-redacted inside checkForm, then fenced as untrusted here.
      return {
        url,
        title,
        ok: report.ok,
        coverage: report.coverage,
        content: wrapUntrustedContent(report.summary, url),
        requiredEmpty: report.requiredEmpty,
        flaggedInvalid: report.flaggedInvalid,
        visibleErrors: report.visibleErrors,
      };
    },
  });

  CapabilityRegistry.register({
    descriptor: descriptor(
      'browser_validate_page',
      'read',
      'Wait for a page load to settle and optionally verify visible text. args: ' +
        '{ tabId?: string, containsText?: string, timeoutMs?: number } — omit tabId for the active tab. ' +
        'Returns { url, title, ok, containsText? }.',
      { aiTask: 'read_understand' },
    ),
    inputSchema: ValidatePageArgs,
    handler: async (args) => {
      await host.waitForLoad(args.tabId, args.timeoutMs);
      const { url, title, text } = await host.readPage(args.tabId);
      const ok = args.containsText === undefined || text.includes(args.containsText);
      return args.containsText === undefined
        ? { url, title, ok }
        : { url, title, ok, containsText: args.containsText };
    },
  });

  // S6 PR6: registered ONLY when the host can broker a credential. A tool the agent can call but that
  // can never succeed is worse than no tool — it invites retries and hides the real blocker.
  if (host.fillCredential !== undefined) {
    CapabilityRegistry.register({
      descriptor: descriptor(
        'credential_update_field',
        'state_changing',
        'Fill a saved username or password into a login field WITHOUT ever seeing it. args: ' +
          "{ ref: number, field: 'username'|'password', tabId?: string } — ref from " +
          'browser_get_elements. The browser resolves the site from the current tab, finds the saved ' +
          'credential for it, asks the user to confirm, and types the value itself. You never receive ' +
          'the secret, so do not ask for it and do not try to read it back. Returns ' +
          '{ filled, field, origin, reason? }; when filled is false the reason says why — hand off to ' +
          'the user rather than retrying.',
      ),
      inputSchema: CredentialFillIntentSchema,
      handler: async (args) => {
        // Re-checked rather than captured, so the closure cannot hold a seam the host later removed.
        if (host.fillCredential === undefined) {
          return { filled: false, field: args.field, origin: '', reason: 'credential filling is unavailable' };
        }
        return host.fillCredential(args.ref, args.field, args.tabId);
      },
    });
  }

  CapabilityRegistry.register({
    descriptor: descriptor(
      'browser_update_history',
      'state_changing',
      "Move a tab through its own history, or reload it. args: { direction: 'back'|'forward'|'reload', " +
        'tabId?: string } — omit tabId for the active tab. Returns { url, title, moved }. ' +
        '`moved: false` means there was nowhere to go (e.g. no previous page), NOT that the page failed ' +
        'to change. Use this to leave a page you opened by mistake instead of guessing its previous URL.',
    ),
    inputSchema: HistoryArgs,
    handler: (args) => host.historyGo(args.direction, args.tabId),
  });

  CapabilityRegistry.register({
    descriptor: descriptor(
      'browser_validate_condition',
      'read',
      'Wait until something is true, instead of guessing how long a page needs. args: ' +
        "{ condition: 'text'|'selector'|'network_idle', value?: string, timeoutMs?: number, tabId?: " +
        'string }. `value` is the text to appear (condition "text") or the CSS selector to become ' +
        'VISIBLE (condition "selector"); "network_idle" needs no value. Returns ' +
        '{ satisfied, waitedMs, condition }. `satisfied: false` is a real answer — it waited and the ' +
        'thing did not arrive — so change approach rather than repeating the same wait.',
      { aiTask: 'read_understand' },
    ),
    inputSchema: WaitConditionArgs,
    handler: async (args) => {
      const timeoutMs = args.timeoutMs ?? 5_000;
      const result = await host.waitForCondition(
        {
          kind: args.condition,
          ...(args.value !== undefined ? { value: args.value } : {}),
          timeoutMs,
        },
        args.tabId,
      );
      return { ...result, condition: args.condition };
    },
  });

  CapabilityRegistry.register({
    descriptor: descriptor(
      'browser_update_page',
      'state_changing',
      'Perform ONE interaction on a page, using a `ref` from browser_get_elements on the same tab. args: ' +
        'one of { action: "click", ref, tabId? } · { action: "hover", ref, tabId? } (the ONLY way to ' +
        'open a menu that appears on :hover — it has no click handler, so its links are not listed ' +
        'until the pointer is over the trigger) · { action: "fill", ref, text, tabId? } · ' +
        '{ action: "press", key, tabId? } (e.g. "Enter", "Tab", "Escape", "ArrowDown") · ' +
        '{ action: "send_keys", keys, tabId? } for a chord or a sequence ("Ctrl+A", "Shift+Tab", ' +
        '"Ctrl+A Delete") — an unsendable keystroke comes back in `unsupportedKeys` rather than failing ' +
        'the step · ' +
        '{ action: "scroll", direction: "up"|"down", amount?, tabId? } · ' +
        '{ action: "scroll_to_text", text, nth?, tabId? } to bring an off-screen target INTO view so it ' +
        'appears in browser_get_elements (use this instead of blind scrolling when you know the label/text; ' +
        '`nth` picks the Nth match, default 1) · ' +
        '{ action: "select_option", ref, value, tabId? } to choose an option in a native <select> dropdown ' +
        '(a native select opens an OS popup that a click/press cannot drive — ALWAYS use this, never click ' +
        'then arrow/type; `value` matches the option label or value). Omit tabId for the active tab. ' +
        'File inputs must be handled through upload_create_item so path grants, approval, and audit apply. ' +
        'Returns { ok, url, title, changed, recoveryHint?, note?, found?, filled? }. ' +
        'For "fill" the result to trust is `filled` — the field value is read back and compared, because a ' +
        'fill never moves page text or structure, so changed=false is EXPECTED after a fill that worked. ' +
        'Never re-fill a field that reported filled=true. changed=true also fires when a ' +
        'click opens a menu/drawer/panel with no new page text (a `note` then says to re-read elements); ' +
        'scroll_to_text returns found=true|false. If ' +
        'changed=false, re-read elements (and scroll if the target may be off-screen) before trying a ' +
        'different ref — never repeat the same ref blindly. ' +
        'A `networkWarning` field appears when a request this interaction sent came back as an HTTP error ' +
        '(e.g. a Save that POSTs and gets 403/500 while the page shows nothing) — treat it as evidence the ' +
        'action did not really take effect and verify before reporting success. Its ABSENCE proves nothing.',
    ),
    inputSchema: UpdatePageArgs,
    handler: async (args) => {
      const before = await host.readPage(args.tabId);
      // S3 PR3: a tab spawned by this interaction is invisible on the acting page, so the only way to
      // notice it is to compare the open set either side of the action.
      const tabsBefore = new Set((host.listOpenTabs?.() ?? []).map((t) => t.id));
      // Action window opens here — after the `before` read, so only requests THIS interaction caused are
      // attributed to it. Same host clock the recorder stamps observations with.
      const actedAt = Date.now();
      let found: boolean | undefined;
      let matchCount: number | undefined;
      let selected: string | null | undefined;
      let optionLabels: string[] | undefined;
      let fieldValue: string | null | undefined;
      let unsupportedKeys: string[] | undefined;
      let occludedBy: string | null | undefined;
      let fillWidget: 'readonly' | 'disabled' | 'combobox' | null | undefined;
      switch (args.action) {
        case 'click':
          ({ occludedBy } = await host.clickElement(args.ref, args.tabId));
          break;
        case 'hover':
          await host.hoverElement(args.ref, args.tabId);
          break;
        case 'fill':
          ({ widget: fillWidget } = await host.fillElement(args.ref, args.text, args.tabId));
          // Read the value back on the SAME snapshot ref (no re-snapshot, so refs stay valid) — the only
          // honest way to tell a fill that worked from one that silently did not.
          fieldValue = await host.readElementValue(args.ref, args.tabId).catch(() => null);
          break;
        case 'press':
          ({ unsupported: unsupportedKeys } = await host.pressKey(args.key, args.tabId));
          break;
        case 'send_keys':
          ({ unsupported: unsupportedKeys } = await host.sendKeys(args.keys, args.tabId));
          break;
        case 'scroll':
          await host.scrollPage(args.direction, args.amount, args.tabId);
          break;
        case 'scroll_to_text':
          ({ found, count: matchCount } = await host.scrollToText(args.text, args.nth, args.tabId));
          break;
        case 'select_option': {
          const optValue = selectOptionValue(args);
          if (optValue !== undefined) {
            ({ selected, options: optionLabels } = await host.selectOption(args.ref, optValue, args.tabId));
          }
          break;
        }
      }
      const spawnedTabs = (host.listOpenTabs?.() ?? []).filter((t) => !tabsBefore.has(t.id));
      const after = await host.readPage(args.tabId);
      // Post-action verification, DOM-level AND network-level (AI-8B): the structural delta alone cannot
      // see a request the server rejected while the UI stayed put.
      const warning = await networkWarning(host, args.tabId, actedAt, after.url);
      const result = interactionResult(args, {
        before,
        after,
        changed: pageChanged(before, after),
        networkFailed: warning !== undefined,
        found,
        matchCount,
        selected,
        optionLabels,
        fieldValue,
        unsupportedKeys,
        occludedBy,
        spawnedTabs,
        fillWidget,
      });
      return warning === undefined ? result : { ...result, networkWarning: warning };
    },
  });
}
