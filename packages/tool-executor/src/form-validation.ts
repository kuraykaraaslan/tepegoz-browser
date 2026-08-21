import { sanitizeContent } from './content-guard.js';
import type { InteractableElement } from './interactable.js';

/**
 * AI-4 `s16` — the pure, deterministic **pre-submit form check**. Given the current element snapshot
 * (with the AI-2 validation attributes) plus the page's visible text, it reports what would block a
 * submit BEFORE the agent clicks and loses the run to a silent validation failure.
 *
 * Three deliberate design rules, each fixing a way this check could otherwise LIE to the agent:
 *  1. **Only `requiredEmpty` blocks.** It is deterministic and *self-clearing* — filling the field makes
 *     it go away. `aria-invalid` and on-page error text are **advisory**: a page typically sets them on a
 *     failed submit and only refreshes them on the NEXT submit, so treating them as blocking would
 *     deadlock the agent after it had already fixed everything.
 *  2. **Coverage is reported, never assumed.** The render-DOM snapshot is viewport-limited and the
 *     accessibility fallback carries no attributes at all, so a clean result from a partial view must
 *     NOT be dressed up as "OK to submit" — that is the exact false confidence s16 exists to prevent.
 *  3. **Page-controlled text is injection-redacted** (`sanitizeContent`, not just a zero-width strip) and
 *     quotes are neutralised before interpolation, so a hostile label/error cannot forge a verdict inside
 *     the checker's own prose. The caller still fences the whole report as untrusted content (AI-5).
 *
 * No regex is executed against page-controlled `pattern` values (ReDoS safety). Pure + Electron-free.
 */

export interface FormIssue {
  /** The field's ref in the snapshot this report was built from. */
  ref: number;
  /** The field's accessible name / placeholder / name attribute (sanitized, quote-neutralised). */
  label: string;
  /** Why it is listed: a still-empty required field (blocking), or page-flagged invalid (advisory). */
  reason: 'required-empty' | 'flagged-invalid';
}

/** How much of the form this report actually saw. `partial` ⇒ the result must not be read as a green light. */
export type FormCoverage = 'complete' | 'partial';

export interface FormReport {
  /** True only when nothing BLOCKING was found **and** coverage is complete. */
  ok: boolean;
  /** Required fields still empty — the blocking, self-clearing signal. */
  requiredEmpty: FormIssue[];
  /** Fields the page marked `aria-invalid="true"` — ADVISORY (may be stale until the next submit). */
  flaggedInvalid: FormIssue[];
  /** Short error-looking lines on the page — ADVISORY (may be stale, or ordinary form copy). */
  visibleErrors: string[];
  /** Whether every field could be inspected; `partial` when the view was limited or constraints absent. */
  coverage: FormCoverage;
  /** Why coverage is partial (empty when complete). */
  coverageNotes: string[];
  /** A compact, model-facing summary — honest about both blockers and coverage. */
  summary: string;
}

export interface CheckFormOptions {
  /**
   * Whether the caller's snapshot covered the WHOLE page. The render-DOM snapshot is viewport-limited by
   * default, so a caller that did not widen it must pass `'partial'` — the report then refuses to give an
   * unqualified green light. Defaults to `'partial'` (safe): callers must opt IN to claiming full coverage.
   */
  coverage?: FormCoverage;
}

/** Input types that carry no user-entered text value (so "required-empty" does not apply). */
const NON_VALUE_TYPES: ReadonlySet<string> = new Set([
  'submit',
  'button',
  'reset',
  'image',
  'hidden',
]);
/** Toggle inputs whose "required" means CHECKED — checked state is not in the snapshot, so a required
 *  toggle is deliberately NOT reported (better silent than a permanent false "empty"). */
const TOGGLE_TYPES: ReadonlySet<string> = new Set(['checkbox', 'radio']);
/** Native tags whose `value` the perception layer actually populates. A custom ARIA widget
 *  (contenteditable / role=textbox on a div) never reports a value, so an `aria-required` one would look
 *  empty FOREVER — those are counted toward coverage instead of being falsely flagged. */
const NATIVE_VALUE_TAGS: ReadonlySet<string> = new Set(['input', 'textarea', 'select']);
/** Max advisory error lines surfaced (bounds a hostile/noisy page). */
const MAX_VISIBLE_ERRORS = 6;
/** Only short lines are considered an inline validation message, not body copy. */
const MAX_ERROR_LINE = 120;
/**
 * Lines that look like a validation MESSAGE, not a field label or hint. Requires a verb-ish/message form
 * ("X is required", "please enter…", "invalid…") rather than the bare word, so ordinary form copy such as
 * "Required fields are marked *" or a "Required" legend does not trip it.
 */
const ERROR_PATTERN =
  /\b(is required|is invalid|is not valid|please enter|please fill|please provide|please select|please correct|cannot be empty|must be|zorunludur|geçersizdir|boş bırakılamaz)\b/i;

function typeOf(el: InteractableElement): string | undefined {
  return el.attributes?.type?.toLowerCase();
}

function isRequired(el: InteractableElement): boolean {
  return el.attributes?.required === 'true' || el.attributes?.['aria-required'] === 'true';
}

/** A native field whose emptiness we can actually determine from the snapshot. */
function isCheckableTextField(el: InteractableElement): boolean {
  const type = typeOf(el);
  if (type !== undefined && (NON_VALUE_TYPES.has(type) || TOGGLE_TYPES.has(type))) return false;
  return el.tag !== undefined && NATIVE_VALUE_TAGS.has(el.tag);
}

/** Neutralise page-controlled text before it is spliced into the checker's own prose: injection-redact,
 *  strip quotes/newlines (so it cannot close a quote and forge a verdict), and cap. */
function safeLabel(raw: string): string {
  const { text } = sanitizeContent(raw);
  return text
    .replace(/["'\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
}

function labelOf(el: InteractableElement): string {
  const attr = el.attributes ?? {};
  const raw = el.name.trim() || attr.placeholder || attr['aria-label'] || attr.name || '';
  const clean = safeLabel(raw);
  return clean.length > 0 ? clean : `field #${String(el.ref)}`;
}

/** Short, message-shaped lines from the page text. Injection-redacted + quote-neutralised: the page text
 *  is untrusted and this report flows back to the model (AI-5). Advisory only — never blocking. */
function scanVisibleErrors(pageText: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const rawLine of pageText.split(/\r?\n/)) {
    if (rawLine.length > MAX_ERROR_LINE * 4) continue; // cheap guard before the regex
    const line = safeLabel(rawLine);
    if (line.length === 0 || line.length > MAX_ERROR_LINE || !ERROR_PATTERN.test(line)) continue;
    if (seen.has(line)) continue;
    seen.add(line);
    out.push(line);
    if (out.length >= MAX_VISIBLE_ERRORS) break;
  }
  return out;
}

const listIssues = (issues: readonly FormIssue[]): string =>
  issues.map((i) => `${i.label} [${String(i.ref)}]`).join(', ');

/**
 * Check a form for anything that would block a submit. `elements` is the current (finalized) snapshot;
 * `pageText` is the page's visible text. Pass `coverage: 'complete'` ONLY when the snapshot really covered
 * the whole page — otherwise the report stays honest that it may have missed fields.
 */
interface Classified {
  requiredEmpty: FormIssue[];
  flaggedInvalid: FormIssue[];
  /** Whether ANY validation constraint was captured — false ⇒ we cannot detect required fields at all. */
  sawAnyConstraint: boolean;
  /** Required controls whose filled-state the snapshot cannot read (custom ARIA widgets, toggles). */
  skippedCustomRequired: number;
}

/** Split the snapshot into the blocking + advisory issue lists and the coverage signals. */
function classify(elements: readonly InteractableElement[]): Classified {
  const requiredEmpty: FormIssue[] = [];
  const flaggedInvalid: FormIssue[] = [];
  let sawAnyConstraint = false;
  let skippedCustomRequired = 0;

  for (const el of elements) {
    const attrs = el.attributes;
    if (attrs?.required !== undefined || attrs?.['aria-required'] !== undefined)
      sawAnyConstraint = true;
    if (attrs?.['aria-invalid'] === 'true') {
      sawAnyConstraint = true;
      flaggedInvalid.push({ ref: el.ref, label: labelOf(el), reason: 'flagged-invalid' });
    }
    if (!isRequired(el)) continue;
    // A required custom/ARIA widget (or toggle): its filled-state is not in the snapshot, so it is a
    // coverage gap rather than a violation — flagging it would never clear.
    if (!isCheckableTextField(el)) {
      skippedCustomRequired += 1;
      continue;
    }
    if (el.value === undefined || el.value.trim().length === 0) {
      requiredEmpty.push({ ref: el.ref, label: labelOf(el), reason: 'required-empty' });
    }
  }
  return { requiredEmpty, flaggedInvalid, sawAnyConstraint, skippedCustomRequired };
}

export function checkForm(
  elements: readonly InteractableElement[],
  pageText = '',
  options: CheckFormOptions = {},
): FormReport {
  const { requiredEmpty, flaggedInvalid, sawAnyConstraint, skippedCustomRequired } =
    classify(elements);
  const coverageNotes: string[] = [];
  const visibleErrors = scanVisibleErrors(pageText);

  if (options.coverage !== 'complete') {
    coverageNotes.push('only the fields in view were inspected (the snapshot is viewport-limited)');
  }
  if (!sawAnyConstraint && elements.length > 0) {
    coverageNotes.push(
      'no validation constraints were captured for this page, so required fields cannot be detected',
    );
  }
  if (skippedCustomRequired > 0) {
    coverageNotes.push(
      `${String(skippedCustomRequired)} required control(s) are custom/toggle widgets whose filled state is not readable — verify them yourself`,
    );
  }
  const coverage: FormCoverage = coverageNotes.length === 0 ? 'complete' : 'partial';
  const ok = requiredEmpty.length === 0 && coverage === 'complete';

  const advisory: string[] = [];
  if (flaggedInvalid.length > 0) {
    advisory.push(
      `${String(flaggedInvalid.length)} field(s) are marked invalid by the page (may be left over from an earlier submit): ${listIssues(flaggedInvalid)}`,
    );
  }
  if (visibleErrors.length > 0)
    advisory.push(`error text on the page (may be stale): ${visibleErrors.join(' | ')}`);
  const advisoryText = advisory.length > 0 ? ` Advisory — ${advisory.join('; ')}.` : '';

  let summary: string;
  if (requiredEmpty.length > 0) {
    summary =
      `Form check: do NOT submit yet — ${String(requiredEmpty.length)} required field(s) still empty: ` +
      `${listIssues(requiredEmpty)}. Fill them, then re-check.${advisoryText}`;
  } else if (coverage === 'complete') {
    summary = `Form check: every required field is filled — nothing blocking found.${advisoryText}`;
  } else {
    summary =
      'Form check: nothing blocking among the fields I could inspect, but coverage was PARTIAL — ' +
      `${coverageNotes.join('; ')}. Scroll through the whole form and verify the remaining fields before submitting.${advisoryText}`;
  }

  return { ok, requiredEmpty, flaggedInvalid, visibleErrors, coverage, coverageNotes, summary };
}
