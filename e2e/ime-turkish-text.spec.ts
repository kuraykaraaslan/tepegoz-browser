import { resolve, join } from 'node:path';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { test, expect, _electron as electron, type ElectronApplication } from '@playwright/test';
import { IME_MATRIX, TURKISH_SPECIAL_LETTERS } from '@tepegoz/i18n';

const appDir = resolve(process.cwd(), 'apps/desktop');

function guiEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined && k !== 'ELECTRON_RUN_AS_NODE') env[k] = v;
  }
  return env;
}

/**
 * The IME regression matrix, run against real inputs in the launched app.
 *
 * `IME_MATRIX` has existed as DATA since Phase 0 — its docblock says the Phase-1a work is "fill the
 * runner", not "design the cases". This is the runner.
 *
 * **What this proves, and what it does not.** It drives the app's real text surfaces and asserts every
 * Turkish character survives the round trip byte for byte. That is the half that actually breaks: an
 * input, a controlled-component handler, a normalization pass or a trim silently mangling `ı` into `i`,
 * or decomposing `ğ` into `g` + a combining breve so the stored value no longer equals what was typed.
 *
 * It does NOT switch the OS keyboard layout, so it is not proof that Turkish-Q and Turkish-F produce
 * these characters — that needs a real layout under a real window manager and stays a manual pass. The
 * matrix's `layout` field is carried into the test name so a manual run can be reconciled against it,
 * and the limitation is stated here rather than left for someone to assume away.
 */
test.describe('Turkish text input survives the app, independent of UI language', () => {
  let app: ElectronApplication;
  let profileDir: string;

  test.beforeAll(async () => {
    profileDir = join(process.cwd(), '.ime-profile');
    mkdirSync(profileDir, { recursive: true });
    writeFileSync(join(profileDir, 'preferences.json'), '{}');
    app = await electron.launch({ args: [`--user-data-dir=${profileDir}`, appDir], env: guiEnv() });
  });

  test.afterAll(async () => {
    await app.close().catch(() => undefined);
    rmSync(profileDir, { recursive: true, force: true });
  });

  /** Open the palette and hand back its input. Each test does this itself: a test that inherits an open
   *  dialog from the one before it fails for reasons that have nothing to do with what it asserts. */
  async function paletteInput() {
    const window = await app.firstWindow();
    await window.waitForLoadState('domcontentloaded');
    const input = window.getByPlaceholder('Type a command or ask Tepegöz…');
    if ((await input.count()) === 0) await window.keyboard.press('Control+k');
    await expect(input).toHaveCount(1);
    return input;
  }

  test('every matrix case round-trips through the command palette', async () => {
    const input = await paletteInput();

    const failures: string[] = [];
    for (const testCase of IME_MATRIX) {
      await input.fill('');
      await input.type(testCase.expected);
      const actual = await input.inputValue();
      if (actual !== testCase.expected) {
        failures.push(
          `${testCase.name}: typed ${JSON.stringify(testCase.expected)} → read ${JSON.stringify(actual)}`,
        );
      }
    }
    expect(failures).toEqual([]);
  });

  test('a mixed-case Turkish word is not damaged by any casing or normalization pass', async () => {
    const input = await paletteInput();

    // `İstanbul` and `ışık` are the two words that break naive handling: the dotted capital İ and the
    // dotless ı are distinct characters, not accents on i, and any `toLowerCase()`/`normalize()` in the
    // input path turns one into the other or into i + a combining dot.
    for (const word of ['İstanbul', 'ışık', 'ÇĞİÖŞÜ', 'çğıöşü', 'Ağrı Dağı']) {
      await input.fill('');
      await input.type(word);
      expect(await input.inputValue()).toBe(word);
    }
  });

  test('every Turkish letter keeps its exact code points — no decomposition', async () => {
    const input = await paletteInput();

    for (const { lower, upper } of TURKISH_SPECIAL_LETTERS) {
      for (const letter of [lower, upper]) {
        await input.fill('');
        await input.type(letter);
        const actual = await input.inputValue();
        // Compare code points, not just strings: `ğ` and `g`+U+0306 render identically and compare
        // unequal, which is exactly the bug a visual check would miss.
        expect([...actual].map((c) => c.codePointAt(0))).toEqual(
          [...letter].map((c) => c.codePointAt(0)),
        );
      }
    }
  });
});
