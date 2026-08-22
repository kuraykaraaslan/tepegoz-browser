import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Every IPC handler that accepts a payload must validate it with zod.
 *
 * That was already true of all 138 of them when this file was written — and nothing enforced it. The
 * rule lived in `CLAUDE.md` and in the docblock of `parsePayload`, which is exactly the kind of rule
 * that holds until the day someone in a hurry writes `payload as SomeType`. The renderer is untrusted
 * by design, so an unvalidated `invoke` payload is a typed hole straight into the main process: the
 * handler's parameter type is a compile-time fiction, and `as` makes it a runtime lie.
 *
 * This is a source scan rather than a runtime check because there is nothing to run — a handler that
 * skips validation behaves perfectly on every well-formed payload, which is all a test could send it.
 * The failure only exists for input a test would have to be told to construct. So the property being
 * checked is structural: the call site mentions a validator.
 *
 * The scan reads the whole `handle(...)` call by balancing parentheses rather than regex-matching a
 * body, because the first `{` after the parameter list is often the RETURN TYPE (`(_e, payload): {
 * runId: string } =>`). An earlier version of this check made exactly that mistake and reported six
 * false positives.
 */

const MAIN_DIR = join(__dirname, '..');
/** `ipc-helpers.ts` DEFINES `handle`/`handleAsync`; its own signatures are not call sites. */
const NOT_A_CALL_SITE = 'ipc-helpers.ts';
const VALIDATORS = /parsePayload|safeParse|Schema\.parse\(|\.parse\(payload/;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    if (!entry.endsWith('.ts') || entry.includes('.test.')) return [];
    if (entry === NOT_A_CALL_SITE) return [];
    return [full];
  });
}

interface CallSite {
  file: string;
  line: number;
  channel: string;
  text: string;
  takesPayload: boolean;
}

/** Extract every `handle(...)`/`handleAsync(...)` call, whole, by balancing parentheses. */
function callSites(file: string): CallSite[] {
  const src = readFileSync(file, 'utf8');
  const out: CallSite[] = [];
  const opener = /\bhandle(?:Async)?\s*\(/g;
  let match: RegExpExecArray | null;
  while ((match = opener.exec(src)) !== null) {
    const open = match.index + match[0].length - 1;
    let depth = 0;
    let i = open;
    for (; i < src.length; i++) {
      if (src[i] === '(') depth++;
      else if (src[i] === ')') {
        depth--;
        if (depth === 0) break;
      }
    }
    const text = src.slice(open, i + 1);
    // The callback's parameter list is the first `(` after the channel argument.
    const params = /,\s*(?:async\s*)?\(([^)]*)\)/.exec(text)?.[1] ?? '';
    out.push({
      file: file
        .slice(MAIN_DIR.length + 1)
        .split(sep)
        .join('/'),
      line: src.slice(0, match.index).split('\n').length,
      channel: text.slice(1, text.indexOf(',')).trim(),
      text,
      takesPayload: /\bpayload\b/.test(params),
    });
  }
  return out;
}

const ALL = sourceFiles(MAIN_DIR).flatMap(callSites);

describe('IPC payload validation is enforced, not merely conventional', () => {
  it('found the handlers to check (the scan itself is not silently empty)', () => {
    // A scan that matches nothing passes every assertion below. This is the guard on the guard.
    expect(ALL.length).toBeGreaterThan(100);
    expect(ALL.filter((c) => c.takesPayload).length).toBeGreaterThan(50);
  });

  it('every handler that takes a payload validates it', () => {
    const unvalidated = ALL.filter((c) => c.takesPayload && !VALIDATORS.test(c.text)).map(
      (c) => `${c.file}:${String(c.line)} ${c.channel}`,
    );
    expect(unvalidated).toEqual([]);
  });

  it('no handler casts its payload with `as` instead of parsing it', () => {
    // The specific shortcut this rule exists to prevent: `payload as SomeInput` type-checks, reads
    // like validation, and does nothing at all.
    const cast = ALL.filter((c) => /\bpayload\s+as\s+/.test(c.text)).map(
      (c) => `${c.file}:${String(c.line)} ${c.channel}`,
    );
    expect(cast).toEqual([]);
  });
});
