import { resolve, join } from 'node:path';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { test, expect, _electron as electron, type ElectronApplication } from '@playwright/test';
import { sendCtrlChord } from './send-chord';

const appDir = resolve(process.cwd(), 'apps/desktop');

function guiEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined && k !== 'ELECTRON_RUN_AS_NODE') env[k] = v;
  }
  return env;
}

/**
 * Command Palette, end to end (Phase 1a): Ctrl+K opens it in the real app, it lists real commands, it
 * filters as you type, and Escape closes it.
 *
 * The palette's arithmetic and keyboard handling are unit-tested (`command-palette-core.test.ts`,
 * `command-palette.test.tsx`). What only a launched app can show is the part in between: that the
 * shortcut is actually bound, that the component is actually mounted in the render tree, and that the
 * command sources are wired to functions the app really has. A palette that passes every unit test and
 * is never mounted looks identical in CI.
 *
 * Located by ROLE and by placeholder from the dictionary — this file must not depend on the UI language
 * beyond the dictionary it reads.
 */
test('Ctrl+K opens the command palette, filters, and closes', async () => {
  // Isolated profile: `preferences.json` present but WITHOUT `onboardingCompleted` → treated as already
  // onboarded, so the palette is not hidden behind the onboarding surface.
  const profileDir = join(process.cwd(), '.command-palette-profile');
  mkdirSync(profileDir, { recursive: true });
  writeFileSync(join(profileDir, 'preferences.json'), '{}');

  const app: ElectronApplication = await electron.launch({
    args: [`--user-data-dir=${profileDir}`, appDir],
    env: guiEnv(),
  });
  try {
    const window = await app.firstWindow();
    await window.waitForLoadState('domcontentloaded');
    // Mounted, not just loaded: the shortcut reaches the renderer as a message, and one sent before its
    // listener exists is lost (this bit on a cold start, when the first launch is slow).
    await expect(window.getByRole('combobox').first()).toBeVisible();
    // The palette's own input, not the omnibox — both are comboboxes.
    const palette = window.getByPlaceholder('Type a command or ask Tepegöz…');

    await expect(palette).toHaveCount(0);

    await sendCtrlChord(app, 'k');
    await expect(palette).toHaveCount(1);

    // Four modes, and at least one real command to run.
    const modes = window.getByRole('tab', { name: /^(Chat|Do|Make|Tasks)$/ });
    await expect(modes).toHaveCount(4);
    const options = window.getByRole('option');
    expect(await options.count()).toBeGreaterThan(0);

    // Typing narrows the list to the commands that match — the "Reopen closed tab" command and the
    // keyboard-shortcut row that describes it — and nothing else survives the filter…
    const unfiltered = await options.count();
    await palette.fill('reo');
    await expect.poll(async () => options.count()).toBeLessThan(unfiltered);
    const narrowed = await options.allInnerTexts();
    expect(narrowed.length).toBeGreaterThan(0);
    expect(narrowed.every((t) => /reopen/i.test(t))).toBe(true);

    // …and a query that matches nothing says so, rather than showing an empty box.
    await palette.fill('zzzznomatch');
    await expect(options).toHaveCount(0);
    await expect(window.getByText('No matching command')).toHaveCount(1);

    await window.keyboard.press('Escape');
    await expect(palette).toHaveCount(0);
  } finally {
    await app.close().catch(() => undefined);
    rmSync(profileDir, { recursive: true, force: true });
  }
});
