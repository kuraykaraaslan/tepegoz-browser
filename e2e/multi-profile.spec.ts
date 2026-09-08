import { resolve, join } from 'node:path';
import { mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { test, expect, _electron as electron, type ElectronApplication } from '@playwright/test';

/**
 * Multi-profile isolation (ADR-0045, docs/tracks/multi-profile-isolation.md), the part a unit test
 * cannot reach: that a real launch of the built app migrates a pre-existing flat install into
 * `Profiles/default/` on first run and boots into that directory rather than the flat root.
 * (`tepegoz://profiles` rendering + IPC trust is covered generically in `tepegoz-internal-pages.spec.ts`.)
 *
 * Isolation: `TEPEGOZ_PROFILES_ROOT` points the profile root at a temp dir. NOT passing
 * `--user-data-dir` (which opts the run out of the profile system) is what exercises the real
 * migration + boot path.
 */
const appDir = resolve(process.cwd(), 'apps/desktop');

function guiEnv(profilesRoot: string): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined && k !== 'ELECTRON_RUN_AS_NODE') env[k] = v;
  }
  env.TEPEGOZ_PROFILES_ROOT = profilesRoot;
  return env;
}

test('a plain launch migrates a flat install into Profiles/default/ and boots into it', async () => {
  const root = join(process.cwd(), '.multi-profile-root');
  rmSync(root, { recursive: true, force: true });
  mkdirSync(root, { recursive: true });
  // A pre-multi-profile install: a flat preferences.json sitting in the root.
  writeFileSync(join(root, 'preferences.json'), '{"locale":"en","onboardingCompleted":true}');

  const app: ElectronApplication = await electron.launch({
    args: [appDir],
    env: guiEnv(root),
  });
  try {
    const window = await app.firstWindow();
    await expect(window.getByRole('banner')).toBeVisible();

    // The flat file moved into Profiles/default/, and the registry was written.
    expect(existsSync(join(root, 'Profiles', 'default', 'preferences.json'))).toBe(true);
    expect(existsSync(join(root, 'preferences.json'))).toBe(false);
    expect(existsSync(join(root, 'profiles.json'))).toBe(true);

    // userData is the profile directory, not the root.
    const userData: string = await app.evaluate(({ app: a }) => a.getPath('userData'));
    expect(userData).toBe(join(root, 'Profiles', 'default'));
  } finally {
    await app.close();
    rmSync(root, { recursive: true, force: true });
  }
});
