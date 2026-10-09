import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * `webContents.executeJavaScript(code, true)` SIMULATES A USER CLICK in the page. It gives the document sticky
 * user activation, which is what the autoplay policy, the popup blocker, fullscreen, clipboard writes and
 * every other "has the user interacted?" check key on. Passed by an automatic injection or a read, it hands
 * every page those permissions for free — it silently defeated the autoplay setting until this was found.
 *
 * So the flag is allowed only where a person has just asked for the action, and every such place is listed
 * here with the reason. A new `true` fails this test; the fix is almost always `false` (injection and reads
 * need no gesture), and a genuine user action is added below with a one-line justification.
 */
const MAIN_DIR = join(process.cwd(), 'src', 'main');

const USER_INITIATED: Readonly<Record<string, string>> = {
  'password/autofill-host.ts': 'the user chose to fill a saved login',
  'extensions/translate-context-menu-contributor.electron.ts':
    'a context-menu item the user clicked',
  'extensions/typo-context-menu-contributor.electron.ts': 'a context-menu item the user clicked',
};

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    const isTs = name.endsWith('.ts') || name.endsWith('.tsx');
    const isTest = /\.(test|spec)\.|test-kit|testkit|\.d\.ts$/.test(name);
    return isTs && !isTest ? [full] : [];
  });
}

/** Files containing an `executeJavaScript(..., true)` call, ignoring comments. */
function filesPassingTheGestureFlag(): string[] {
  const hits: string[] = [];
  for (const file of sourceFiles(MAIN_DIR)) {
    const code = readFileSync(file, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    for (const m of code.matchAll(/executeJavaScript\(/g)) {
      let depth = 1;
      let quote: string | null = null;
      let i = (m.index ?? 0) + m[0].length;
      const start = i;
      for (; i < code.length && depth > 0; i += 1) {
        const c = code[i]!;
        if (quote !== null) {
          if (c === '\\') i += 1;
          else if (c === quote) quote = null;
        } else if (c === '"' || c === "'" || c === '`') quote = c;
        else if (c === '(') depth += 1;
        else if (c === ')') depth -= 1;
      }
      if (/,\s*true\s*,?\s*$/.test(code.slice(start, i - 1))) {
        hits.push(relative(MAIN_DIR, file).split('\\').join('/'));
        break;
      }
    }
  }
  return hits.sort();
}

describe('user activation is never granted to a page by accident', () => {
  it('passes the simulate-a-click flag only from the listed user-initiated actions', () => {
    expect(filesPassingTheGestureFlag()).toEqual(Object.keys(USER_INITIATED).sort());
  });

  it('every allowlisted file still needs its entry (no stale exceptions)', () => {
    const found = new Set(filesPassingTheGestureFlag());
    for (const file of Object.keys(USER_INITIATED)) expect(found.has(file)).toBe(true);
  });
});
