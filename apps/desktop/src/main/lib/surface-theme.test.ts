import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The main process mirrors two token values by hand so a native popup paints the right colour before
 * anything renders. Its own comment says so: "mirror packages/ui/styles/tokens.css … kept in sync by
 * hand."
 *
 * A hand-kept mirror is where drift hides, and this one is invisible when it drifts: the popup simply
 * flashes the old colour for a frame, which nobody files a bug about and no test would notice. So the
 * hand-sync is now checked against the file it mirrors.
 *
 * The module itself imports `electron`, so this asserts on the constants in its source rather than
 * importing it — that keeps the check running in the ordinary unit suite instead of needing Electron.
 */

const SOURCE = readFileSync(join(__dirname, 'surface-theme.ts'), 'utf8');
const TOKENS = readFileSync(
  join(__dirname, '..', '..', '..', '..', '..', 'packages', 'ui', 'styles', 'tokens.css'),
  'utf8',
);

function constant(name: string): string {
  const m = new RegExp(`const ${name} = '(#[0-9a-fA-F]{6})'`).exec(SOURCE);
  if (m === null) throw new Error(`${name} not found in surface-theme.ts`);
  return (m[1] as string).toLowerCase();
}

/** `--surface-base` from a `:root` / `.dark` block of tokens.css. */
function surfaceBase(selector: string): string {
  const start = TOKENS.indexOf(`${selector} {`);
  const end = TOKENS.indexOf('\n}', start);
  const m = /--surface-base:\s*(#[0-9a-fA-F]{6});/.exec(TOKENS.slice(start, end));
  if (m === null) throw new Error(`--surface-base not found in ${selector}`);
  return (m[1] as string).toLowerCase();
}

describe('the popup first-paint colours still match the design tokens', () => {
  it('found both sides', () => {
    expect(surfaceBase(':root')).toMatch(/^#[0-9a-f]{6}$/);
    expect(surfaceBase('.dark')).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('light matches --surface-base in :root', () => {
    expect(constant('LIGHT_SURFACE')).toBe(surfaceBase(':root'));
  });

  it('dark matches --surface-base in .dark', () => {
    expect(constant('DARK_SURFACE')).toBe(surfaceBase('.dark'));
  });

  it('uses the same hex validation as the renderer, so the two agree on what a custom colour is', () => {
    // A colour one side accepts and the other rejects means the popup paints the mode surface while
    // the renderer paints the custom one — a flash of the wrong colour on every popup.
    const mainHex = /const HEX = (\/[^/]+\/)/.exec(SOURCE)?.[1];
    const rendererSource = readFileSync(
      join(__dirname, '..', '..', 'renderer', 'src', 'lib', 'theme.ts'),
      'utf8',
    );
    const rendererHex = /return (\/[^/]+\/)\.test\(value\)/.exec(rendererSource)?.[1];
    expect(mainHex).toBeDefined();
    expect(rendererHex).toBe(mainHex);
  });
});
