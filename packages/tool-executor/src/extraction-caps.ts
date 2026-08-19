import { createHash } from 'node:crypto';

/**
 * Bounds and bookkeeping for model-authored extraction scripts (S5).
 *
 * Pure and dependency-free so the limits can be tested without a browser — the sandbox that runs the
 * script is proven separately by the e2e spike; this is the half that decides what may go in and how
 * much may come back.
 */

/** Longest script we will run. A model that needs more than this is not writing an extractor. */
export const MAX_SCRIPT_CHARS = 8_000;
/** Result bytes returned to the model. Mirrors the element-cap discipline in the DOM plane. */
export const MAX_RESULT_CHARS = 40_000;
/** Rows/items returned from an array result. */
export const MAX_RESULT_ITEMS = 500;
/** Wall-clock a single extraction may take before it is abandoned. */
export const EXTRACTION_TIMEOUT_MS = 5_000;

/**
 * The script identity written to the journal.
 *
 * The **hash, never the body** (ADR-0026). A model-authored script is composed from page content, so
 * journaling it verbatim would copy whatever a hostile page persuaded the model to write into the audit
 * log — an injection payload preserved in the one place meant to be trustworthy. A hash still answers
 * the question an audit asks ("was this the same script as last time?") without carrying the payload.
 */
export function scriptHash(script: string): string {
  return createHash('sha256').update(script, 'utf8').digest('hex').slice(0, 16);
}

export interface ScriptRejection {
  ok: false;
  reason: string;
}
export interface ScriptAccepted {
  ok: true;
  script: string;
  hash: string;
}

/**
 * Accept or refuse a script before it runs.
 *
 * Deliberately NOT a content filter. There is no attempt here to detect "malicious" JavaScript by
 * looking for `fetch` or `document.cookie`: that check is unwinnable (string concatenation, `atob`,
 * property lookup by computed name) and, worse, believing it would make the real defences feel
 * optional. The sandbox is what makes a network call impossible; this only refuses input that is
 * unusable or absurd.
 */
export function acceptScript(raw: unknown): ScriptAccepted | ScriptRejection {
  if (typeof raw !== 'string') return { ok: false, reason: 'script must be a string' };
  const script = raw.trim();
  if (script.length === 0) return { ok: false, reason: 'script is empty' };
  if (script.length > MAX_SCRIPT_CHARS) {
    return { ok: false, reason: `script exceeds ${String(MAX_SCRIPT_CHARS)} characters` };
  }
  return { ok: true, script, hash: scriptHash(script) };
}

export interface CappedResult {
  /** The value as text, capped. Always a string: the model reads text, not object graphs. */
  value: string;
  truncated: boolean;
  /** Items kept, when the script returned an array. Absent for a scalar or object result. */
  items?: number;
}

/**
 * Cap a script's return value for the model.
 *
 * Truncation is always REPORTED. A silently shortened table is worse than no table: the model would
 * aggregate over what it was given and state the answer with full confidence, and nothing downstream
 * could tell that the input was partial.
 */
export function capResult(value: unknown): CappedResult {
  if (Array.isArray(value)) {
    const kept = value.slice(0, MAX_RESULT_ITEMS);
    const itemsTruncated = kept.length < value.length;
    const text = kept.map((v) => stringify(v)).join('\n');
    const capped = capText(text);
    return {
      value: capped.value,
      truncated: capped.truncated || itemsTruncated,
      items: kept.length,
    };
  }
  return capText(stringify(value));
}

function stringify(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    return JSON.stringify(value) ?? '';
  } catch {
    // A cyclic or non-serialisable return is the script's bug, and saying so is more useful than an
    // empty string that reads like an empty page.
    return '[unserialisable result]';
  }
}

function capText(text: string): CappedResult {
  return text.length <= MAX_RESULT_CHARS
    ? { value: text, truncated: false }
    : { value: text.slice(0, MAX_RESULT_CHARS), truncated: true };
}
