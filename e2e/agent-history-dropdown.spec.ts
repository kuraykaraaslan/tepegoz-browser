import { resolve, join } from 'node:path';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { test, expect, _electron as electron, type ElectronApplication } from '@playwright/test';

/**
 * The Agent Console's conversation-history dropdown must stay INSIDE the docked sidebar.
 *
 * The browsed page is a native `WebContentsView` (ADR-0012) that Electron paints above every chrome DOM
 * node, whatever the `z-index` — so a menu that overflows the sidebar sideways is not drawn over the
 * page, it disappears behind it. That occlusion is invisible to jsdom and to a unit test: only a real
 * window has a real native view, so only an e2e can prove the geometry holds.
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

test('the conversation-history menu opens inside the Agent sidebar, never over the page', async () => {
  // Isolated profile: `preferences.json` present but WITHOUT `onboardingCompleted` → already onboarded.
  // The locale is pinned so this file may locate by its English accessible names.
  const profileDir = join(process.cwd(), '.agent-history-profile');
  mkdirSync(profileDir, { recursive: true });
  writeFileSync(join(profileDir, 'preferences.json'), '{"locale":"en"}');

  const app: ElectronApplication = await electron.launch({
    args: [`--user-data-dir=${profileDir}`, appDir],
    env: guiEnv(),
  });
  try {
    const window = await app.firstWindow();
    await expect(window.getByRole('banner')).toBeVisible();

    // Nothing is pinned on a fresh profile, so the Agent's sidebar action is reached through the
    // Extensions panel (its own native window) — the same relay the extensions-panel spec covers.
    const panelOpened = app.waitForEvent('window');
    await window.getByRole('button', { name: 'Extensions', exact: true }).click();
    const panel = await panelOpened;
    await panel
      .getByRole('listitem')
      .filter({ hasText: 'Agent' })
      .getByRole('button', { name: 'Agent', exact: true })
      .click();

    const sidebar = window.getByRole('complementary', { name: 'Agent' });
    await expect(sidebar).toBeVisible();

    await window.getByRole('button', { name: 'Conversation history' }).click();
    const menu = window.getByTestId('agent-history-menu');
    await expect(menu).toBeVisible();

    const dock = await sidebar.boundingBox();
    const box = await menu.boundingBox();
    expect(dock).not.toBeNull();
    expect(box).not.toBeNull();
    if (dock === null || box === null) return;

    // The whole menu — both edges — has to live within the dock. Before the fix its left edge sat ~36px
    // into the web view's region and was swallowed by the native view.
    expect(box.x).toBeGreaterThanOrEqual(dock.x);
    expect(box.x + box.width).toBeLessThanOrEqual(dock.x + dock.width);
    // And it is still a real menu, not a clamped sliver.
    expect(box.width).toBeGreaterThan(160);
  } finally {
    await app.close();
    rmSync(profileDir, { recursive: true, force: true });
  }
});
