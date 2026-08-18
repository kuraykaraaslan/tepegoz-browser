/**
 * Keyboard chord parsing (S3 PR2) — pure, so it is unit-testable and Electron-free.
 *
 * `press` could send exactly one named key, and an unknown name raised a hard 400. Both halves were
 * wrong for an agent: real pages need `Ctrl+A`, `Shift+Tab`, `Ctrl+Shift+K`, and a failed keystroke is
 * a *fact to report*, not a reason to end a run — the agent can nearly always reach the same goal
 * another way if it is told what did not happen.
 *
 * This module decides only the SHAPE of a chord (which modifiers, which base key, in what order).
 * Whether the base key can actually be dispatched is the driver's question, because only the driver
 * knows the key table its transport supports.
 */

/** CDP `Input.dispatchKeyEvent` modifier bits. */
export const MODIFIER_BITS = { Alt: 1, Control: 2, Meta: 4, Shift: 8 } as const;

/** Modifier spellings a model plausibly emits, normalized to one canonical name each. */
const MODIFIER_ALIASES: Record<string, keyof typeof MODIFIER_BITS> = {
  alt: 'Alt',
  option: 'Alt',
  ctrl: 'Control',
  control: 'Control',
  cmd: 'Meta',
  command: 'Meta',
  meta: 'Meta',
  super: 'Meta',
  win: 'Meta',
  shift: 'Shift',
};

/** Upper bound on one call, so a chord string cannot become an unbounded input storm. */
export const MAX_CHORD_STEPS = 20;

export interface ChordStep {
  /** OR-ed {@link MODIFIER_BITS}. 0 when the step is a bare key. */
  modifiers: number;
  /** The base key as written, with only casing normalized for known named keys. */
  key: string;
}

export interface ParsedChords {
  steps: ChordStep[];
  /** Fragments that carried no base key at all (e.g. a lone "Ctrl+"). Reported, never thrown. */
  malformed: string[];
}

/** Named keys whose canonical casing we can restore, so `enter`, `ENTER` and `Enter` all work. */
const NAMED_KEYS = [
  'Enter',
  'Tab',
  'Escape',
  'Backspace',
  'Delete',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Home',
  'End',
  'PageUp',
  'PageDown',
  'Space',
] as const;

const NAMED_BY_LOWER = new Map(NAMED_KEYS.map((k) => [k.toLowerCase(), k as string]));

/** Restore the canonical spelling of a named key; leave anything else (a printable character) as typed. */
function normalizeKey(raw: string): string {
  return NAMED_BY_LOWER.get(raw.toLowerCase()) ?? raw;
}

/**
 * Parse a chord string into ordered steps.
 *
 * Steps are separated by whitespace or commas (`"Ctrl+A Delete"`, `"Ctrl+A, Delete"`); modifiers within
 * a step by `+` or `-`. A `+` that IS the key survives, since `Ctrl++` is a real shortcut: the last
 * non-empty fragment is always the base key, never a modifier.
 */
export function parseChords(input: string): ParsedChords {
  const steps: ChordStep[] = [];
  const malformed: string[] = [];
  const fragments = input.split(/[\s,]+/).filter((f) => f.length > 0);
  for (const fragment of fragments.slice(0, MAX_CHORD_STEPS)) {
    const parts = fragment.split(/[+-]/);
    // A trailing separator leaves an empty last part, which is ambiguous: `Ctrl+` is a modifier with no
    // key (malformed), while `Ctrl++` really does mean the `+` key. Two separators in a row is what
    // tells them apart — anything else with an empty tail is reported rather than guessed at.
    const doubledSeparator = /[+-][+-]$/.test(fragment);
    const key =
      parts[parts.length - 1] === ''
        ? doubledSeparator
          ? fragment.slice(-1)
          : ''
        : (parts.pop() ?? '');
    if (key.length === 0) {
      malformed.push(fragment);
      continue;
    }
    let modifiers = 0;
    let unknownModifier = false;
    for (const part of parts) {
      if (part.length === 0) continue;
      const canonical = MODIFIER_ALIASES[part.toLowerCase()];
      if (canonical === undefined) {
        unknownModifier = true;
        continue;
      }
      modifiers |= MODIFIER_BITS[canonical];
    }
    // An unrecognised modifier makes the whole step a guess — report it rather than silently sending a
    // different keystroke than the caller asked for.
    if (unknownModifier) {
      malformed.push(fragment);
      continue;
    }
    steps.push({ modifiers, key: normalizeKey(key) });
  }
  return { steps, malformed };
}
