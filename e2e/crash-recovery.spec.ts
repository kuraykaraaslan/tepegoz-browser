import { resolve, join } from 'node:path';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { spawnSync } from 'node:child_process';
import type { AddressInfo } from 'node:net';
import { test, expect, _electron as electron, type ElectronApplication } from '@playwright/test';

/**
 * The recovery ladder (ADR-0038), driven against the real app rather than described.
 *
 * Every rung here depends on one thing that cannot be unit-tested: a main process that is KILLED runs no
 * handler. So the app is actually killed — `SIGKILL` on the Electron process, no `before-quit`, no
 * goodbye — and the next launch has to work out what happened from the file the previous launch left
 * behind. A test that closed the app politely would be testing the opposite of the case that matters.
 *
 * The ladder walked here, in order:
 *   1. crash → the next launch restores the tabs AND says so, offering the undo;
 *   2. crash again → the third launch is safe mode: it does NOT restore;
 *   3. safe mode did not destroy anything — a clean quit, and the session comes back whole.
 *
 * (3) is the assertion worth the length of this file. Safe mode's refusal to restore is only safe
 * because it also refuses to PERSIST; had it written its one blank tab over the snapshot, this run would
 * end with the user's session gone and every earlier assertion still green.
 */

const appDir = resolve(process.cwd(), 'apps/desktop');

/** A clean env without ELECTRON_RUN_AS_NODE (some shells set it, which makes Electron run as Node). */
function guiEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined && k !== 'ELECTRON_RUN_AS_NODE') env[k] = v;
  }
  return env;
}

test('the recovery ladder: crash → restore + notice → safe mode → session intact', async () => {
  test.setTimeout(240_000);

  // A local page as the home page, so every tab this test opens is a real web URL (only those are
  // persisted) without depending on anyone's uptime.
  const server: Server = createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end('<!doctype html><html><head><title>Recovery Page</title></head><body>ok</body></html>');
  });
  await new Promise<void>((r) => {
    server.listen(0, '127.0.0.1', () => {
      r();
    });
  });
  const pageUrl = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}/`;

  const profileDir = join(process.cwd(), '.recovery-profile');
  rmSync(profileDir, { recursive: true, force: true });
  mkdirSync(profileDir, { recursive: true });
  // Present but without `onboardingCompleted` → treated as already onboarded (see preference-store.ts).
  writeFileSync(join(profileDir, 'preferences.json'), JSON.stringify({ homepageUrl: pageUrl }));

  const launch = (): Promise<ElectronApplication> =>
    electron.launch({ args: [`--user-data-dir=${profileDir}`, appDir], env: guiEnv() });

  /**
   * Kill the app outright: no `before-quit`, so the crash counter is left mid-launch — exactly the state
   * a real crash leaves. The whole process TREE goes, not just the main process: Electron's
   * single-instance lock lives in the profile directory, and an orphaned GPU/utility child keeps the
   * next launch from claiming it (which shows up as the relaunch quitting on itself, not as a crash).
   */
  const crash = async (app: ElectronApplication): Promise<void> => {
    const pid = app.process().pid;
    if (process.platform === 'win32' && pid !== undefined) {
      spawnSync('taskkill', ['/pid', String(pid), '/T', '/F']);
    } else {
      app.process().kill('SIGKILL');
    }
    await new Promise((r) => setTimeout(r, 3_000)); // let the OS reap it and release the profile lock
  };

  try {
    // ── 1. A session worth losing ─────────────────────────────────────────────────────────────────
    let app = await launch();
    let window = await app.firstWindow();
    await expect(window.locator('[role="tab"]').first()).toBeVisible();
    // Drive a real page into the session. Every assertion below asks for THIS tab by its page title
    // rather than counting rows: a blank new tab is the internal `tepegoz://newtab` chooser, which is
    // deliberately not part of the snapshot, so counts vary with UI decisions this test has no business
    // pinning. The title is ours, so the check also survives the app running in Turkish.
    const omnibox = window.getByRole('combobox').first();
    await omnibox.fill(pageUrl);
    await omnibox.press('Enter');
    const restoredTab = (w: typeof window) => w.getByRole('tab', { name: /Recovery Page/ });
    // `role="status"` is also used by the lazy-surface loading fallback, so the toast is picked out by
    // the thing only a toast has: buttons (its action + the dismiss ×).
    const toastOf = (w: typeof window) =>
      w.locator('[role="status"]').filter({ has: w.locator('button') });
    await expect(restoredTab(window)).toHaveCount(1);
    await new Promise((r) => setTimeout(r, 3_000)); // past the 400 ms persist debounce
    await crash(app);

    // ── 2. The launch after a crash: restore, and say so ──────────────────────────────────────────
    app = await launch();
    window = await app.firstWindow();
    // The notice is checked FIRST, and deliberately so: a toast auto-dismisses after six seconds, so an
    // assertion queued behind a slower one can miss a toast that really did appear. Asserted by ROLE,
    // never by text — this file must not fail because the app is running in Turkish.
    const toast = toastOf(window).first();
    await expect(toast).toBeVisible({ timeout: 15_000 });
    await expect(toast.getByRole('button')).toHaveCount(2); // the undo + the dismiss ×
    // And the page is back, with no dialog asked and no click spent. This is the behaviour Chrome gates
    // behind "Restore pages?".
    await expect(restoredTab(window)).toHaveCount(1);
    await crash(app);

    // ── 3. Two crashes in a row: safe mode, which does NOT restore ────────────────────────────────
    app = await launch();
    window = await app.firstWindow();
    await expect(toastOf(window).first()).toBeVisible({ timeout: 15_000 });
    // The tab that may have been the cause is NOT reopened — that is the whole point of the rung.
    await expect(restoredTab(window)).toHaveCount(0);
    // Quit properly this time — a clean exit is what clears the counter and ends safe mode.
    await app.close();

    // ── 4. Safe mode cost the user nothing ────────────────────────────────────────────────────────
    app = await launch();
    window = await app.firstWindow();
    await expect(restoredTab(window)).toHaveCount(1);
    // Nothing crashed before this launch, so nothing is announced.
    await expect(toastOf(window)).toHaveCount(0);
    await app.close();
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
    // Best-effort: a killed Electron can still hold a handle on the profile for a moment, and a cleanup
    // failure must not be what a reader sees instead of the assertion that actually failed.
    try {
      rmSync(profileDir, { recursive: true, force: true });
    } catch {
      /* leave it for the next run's rmSync at the top */
    }
  }
});
