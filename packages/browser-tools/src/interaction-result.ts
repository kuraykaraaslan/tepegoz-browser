import type { z } from 'zod';
import { safeValue, structuralOnlyChange, type PageFingerprint } from './action-signals';
import { selectOptionValue, type UpdatePageArgs } from './tool-args';

/**
 * How `browser_update_page` reports one completed interaction back to the model: the per-action rules
 * that turn the before/after page delta (plus whatever the host observed) into a result with honest
 * `changed` / `note` / `recoveryHint` fields. Split out of `browser-tools.ts`.
 */

/** Result for a `select_option`: on a miss, surface the real option list so the model retries with an
 *  exact label rather than falling back to clicking the native (OS-popup) select. */
function selectOptionResult(
  value: string | undefined,
  selected: string | null | undefined,
  optionLabels: string[] | undefined,
  after: { url: string; title: string },
  changed: boolean,
): {
  ok: true;
  url: string;
  title: string;
  changed: boolean;
  recoveryHint?: string;
  note?: string;
} {
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
  return {
    ok: true,
    url: after.url,
    title: after.title,
    changed,
    note: `Selected "${selected}" in the dropdown.`,
  };
}

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
  /** `drag` only: which mechanism actually ran — `'native'` (HTML5 `draggable`) or `'pointer'` (a held
   *  mousedown moved and released, what sortable-list/kanban widgets listen for). S3 PR6 spike. */
  dragMode?: 'native' | 'pointer';
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
  /** `drag` only: which mechanism actually ran (S3 PR6 spike). */
  dragMode?: 'native' | 'pointer' | undefined;
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
function scrollToTextResult(nthRequested: number, ctx: InteractionContext): InteractionResult {
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

export function interactionResult(
  args: z.infer<typeof UpdatePageArgs>,
  ctx: InteractionContext,
): InteractionResult {
  const body = withSpawnedTabs(interactionResultBody(args, ctx), ctx.spawnedTabs ?? []);
  // `drag`'s mechanism is reported regardless of which change/no-change branch answered below — the
  // model gains nothing from knowing it, but a human debugging "the drag didn't work" needs to see which
  // of the two incompatible mechanisms actually ran before guessing why.
  return args.action === 'drag' && ctx.dragMode !== undefined
    ? { ...body, dragMode: ctx.dragMode }
    : body;
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
    return selectOptionResult(
      selectOptionValue(args),
      ctx.selected,
      ctx.optionLabels,
      after,
      changed,
    );
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
