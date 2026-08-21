import type { InteractableElement } from './interactable.js';

/**
 * Snapshot diffing + unchanged-region elision (S2 PR2) — pure, Electron-free.
 *
 * Before this, an unchanged page handed the model the whole ≤200-element list again every step. The
 * only signal was a `*` marking a new element; everything else was re-sent in full, which burns tokens
 * on information the model already has and buries the two rows that actually moved.
 *
 * Elision is only safe **because refs are identity-stable** (PR1): a ref the model saw three steps ago
 * still addresses the same element, so "42 elements unchanged" is a statement it can act on rather than
 * a hole in its view. Both live behind the same flag for exactly that reason — eliding under positional
 * refs would hide elements whose numbers had silently moved.
 */

/** Contiguous unchanged runs shorter than this stay listed: local context is worth more than the tokens. */
export const MIN_ELISION_RUN = 4;

/** What the model was last shown, per ref. Held by the caller for one page, per tab. */
export interface SnapshotDigest {
  /** Step at which this digest was taken — quoted in the elision marker so "since" is concrete. */
  step: number;
  /** ref → a fingerprint of everything about the element BESIDES its identity (value, state, attrs). */
  detail: Map<number, string>;
  /** ref → short label, so a removal can be named rather than merely numbered. */
  label: Map<number, string>;
}

export type ElementChange = 'added' | 'changed' | 'unchanged';

export interface ElementsDiff {
  /** `status[i]` describes `elements[i]`. */
  status: ElementChange[];
  /** Elements the model was shown last time that are gone now. */
  removed: { ref: number; label: string }[];
  /** The step the unchanged elements have been carried since. */
  since: number;
}

/**
 * Everything about an element except its identity. A change here is a genuine state change — a value
 * typed, a control disabled, `aria-expanded` flipped.
 *
 * A change to the element's NAME is not represented here on purpose: the name is part of its identity
 * (PR1), so a relabelled control reads as one removal plus one addition. That is what it is at the
 * identity level, and it is more useful to the model than a "changed" row that hides which ref to use.
 */
function detailOf(el: InteractableElement): string {
  const attrs = Object.entries(el.attributes ?? {})
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join(',');
  return [
    el.role,
    el.href ?? '',
    el.value ?? '',
    el.disabled === true ? 'disabled' : '',
    attrs,
  ].join('|');
}

/** Capture what this snapshot showed, to diff the next one against. */
export function digestOf(elements: readonly InteractableElement[], step: number): SnapshotDigest {
  const detail = new Map<number, string>();
  const label = new Map<number, string>();
  for (const el of elements) {
    detail.set(el.ref, detailOf(el));
    label.set(el.ref, el.name.length > 0 ? el.name : (el.tag ?? el.role));
  }
  return { step, detail, label };
}

/**
 * Diff this snapshot against the previous one. With no previous digest everything is `added` — a first
 * look is not a page full of changes, but calling it `unchanged` would let the elider hide the entire
 * page from a model that has never seen it.
 */
export function diffElements(
  elements: readonly InteractableElement[],
  previous: SnapshotDigest | null,
): ElementsDiff {
  if (previous === null) {
    return { status: elements.map(() => 'added'), removed: [], since: 0 };
  }
  const status = elements.map<ElementChange>((el) => {
    const before = previous.detail.get(el.ref);
    if (before === undefined) return 'added';
    return before === detailOf(el) ? 'unchanged' : 'changed';
  });
  const present = new Set(elements.map((el) => el.ref));
  const removed = [...previous.label]
    .filter(([ref]) => !present.has(ref))
    .map(([ref, label]) => ({ ref, label }));
  return { status, removed, since: previous.step };
}

/**
 * Collapse the runs of unchanged elements the model can already account for. Runs shorter than
 * {@link MIN_ELISION_RUN} are left listed — the tokens they cost are cheaper than the local context
 * they carry around a change.
 *
 * `render` is injected so this module never has to know the listing format (pseudo-HTML or TSV).
 */
export function renderDiffedElements(
  elements: readonly InteractableElement[],
  diff: ElementsDiff,
  render: (el: InteractableElement, change: ElementChange) => string,
): string {
  const lines: string[] = [];
  let run: InteractableElement[] = [];
  const flushRun = (): void => {
    if (run.length === 0) return;
    if (run.length >= MIN_ELISION_RUN) {
      lines.push(
        `§ ${String(run.length)} elements unchanged since step ${String(diff.since)} ` +
          `(refs ${String(run[0]?.ref ?? 0)}–${String(run[run.length - 1]?.ref ?? 0)} still valid)`,
      );
    } else {
      for (const el of run) lines.push(render(el, 'unchanged'));
    }
    run = [];
  };

  elements.forEach((el, i) => {
    const change = diff.status[i] ?? 'added';
    if (change === 'unchanged') {
      run.push(el);
      return;
    }
    flushRun();
    lines.push(render(el, change));
  });
  flushRun();

  if (diff.removed.length > 0) {
    const gone = diff.removed.map((r) => `[${String(r.ref)}] ${r.label}`).join(', ');
    lines.push(`− gone since step ${String(diff.since)}: ${gone}`);
  }
  return lines.length > 0 ? lines.join('\n') : '(no interactable elements found)';
}
