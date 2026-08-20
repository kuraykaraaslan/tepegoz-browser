import { resolve, join } from 'node:path';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { test, expect, _electron as electron, type ElectronApplication } from '@playwright/test';

/**
 * The Chrome-style extensions toolbar: nothing is pinned on a fresh profile, the puzzle button opens the
 * Extensions panel, and pinning from that panel puts an icon on the toolbar.
 *
 * The panel is its OWN native window (a DOM popover would be occluded by the page's WebContentsView), so
 * the only way to prove the feature is a two-window test: the pin is written by the panel's renderer,
 * and the toolbar — a different renderer, in a different window — has to pick it up. That cross-window
 * hop is exactly what a unit test cannot see.
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

test('the puzzle button opens the Extensions panel, and pinning there adds a toolbar icon', async () => {
  // Isolated profile: `preferences.json` present but WITHOUT `onboardingCompleted` → already onboarded.
  // The locale is pinned so this file may locate by its English accessible names.
  const profileDir = join(process.cwd(), '.extensions-panel-profile');
  mkdirSync(profileDir, { recursive: true });
  writeFileSync(join(profileDir, 'preferences.json'), '{"locale":"en"}');

  const app: ElectronApplication = await electron.launch({
    args: [`--user-data-dir=${profileDir}`, appDir],
    env: guiEnv(),
  });
  try {
    const window = await app.firstWindow();
    await expect(window.getByRole('banner')).toBeVisible();

    // Fresh profile → nothing pinned, so Adblock Shield has no toolbar icon yet (Chrome's default).
    const pinnedIcon = window.getByRole('button', { name: 'Adblock Shield', exact: true });
    await expect(pinnedIcon).toHaveCount(0);

    const puzzle = window.getByRole('button', { name: 'Extensions', exact: true });
    await expect(puzzle).toBeVisible();
    const panelOpened = app.waitForEvent('window');
    await puzzle.click();
    const panel = await panelOpened;

    // Every enabled extension is listed, grouped by the page access its manifest declares.
    await expect(panel.getByRole('heading', { name: 'Can read or change page content' })).toBeVisible();
    await expect(panel.getByRole('heading', { name: 'No page access needed' })).toBeVisible();
    const row = panel.getByRole('listitem').filter({ hasText: 'Adblock Shield' });
    await expect(row).toHaveCount(1);

    // Pin it. The panel writes preferences; the toolbar lives in the OTHER window and must react.
    await row.getByRole('button', { name: 'Pin to toolbar' }).click();
    await expect(pinnedIcon).toBeVisible();

    // The panel stays open on pin (as Chrome's does) and the row now offers the reverse action.
    await expect(row.getByRole('button', { name: 'Unpin from toolbar' })).toBeVisible();

    // Clicking the row itself runs the extension's click action. The panel cannot resolve surfaces (it
    // is not the chrome), so this proves the main-process relay: panel → main → chrome window → popup.
    const extPopupOpened = app.waitForEvent('window');
    await row.getByRole('button', { name: 'Adblock Shield' }).click();
    const extPopup = await extPopupOpened;
    // `surface=ext&`, not `surface=ext` — the panel's own URL starts with `surface=extensions-panel`.
    expect(extPopup.url()).toContain('surface=ext&');
    expect(extPopup.url()).toContain('id=com.tepegoz.adblock');
  } finally {
    await app.close();
    rmSync(profileDir, { recursive: true, force: true });
  }
});
