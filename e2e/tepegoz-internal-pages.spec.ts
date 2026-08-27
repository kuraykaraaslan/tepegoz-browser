import { resolve, join } from 'node:path';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { test, expect, _electron as electron, type ElectronApplication } from '@playwright/test';
import { pollEvaluate } from './poll-evaluate';

/**
 * Faz 3 of phases/tracks/protocol-tepegoz-pages.md: extensions/history/downloads/uploads/bookmarks
 * migrated to real pages the same way settings was (`e2e/tepegoz-settings-page.spec.ts` covers the
 * settings-specific context-menu acceptance criterion). This file's job is narrower and applies to all
 * five at once: each host renders real content through the SAME inlined-document mechanism
 * (`internal-pages/protocol.ts`), dispatched to its own `*PageSurface.tsx` by `main.tsx`'s hostname
 * check — a blank page here would mean that dispatch or that surface's own data fetch is broken.
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

const PAGES = ['extensions', 'history', 'downloads', 'uploads', 'bookmarks'];

test('every migrated tepegoz:// internal page loads as a real page with real content', async () => {
  const profileDir = join(process.cwd(), '.tepegoz-internal-pages-profile');
  mkdirSync(profileDir, { recursive: true });
  writeFileSync(join(profileDir, 'preferences.json'), '{"locale":"en"}');

  const app: ElectronApplication = await electron.launch({
    args: [`--user-data-dir=${profileDir}`, appDir],
    env: guiEnv(),
  });
  try {
    const window = await app.firstWindow();
    await expect(window.getByRole('banner')).toBeVisible();
    const omnibox = window.getByRole('combobox').first();

    for (const page of PAGES) {
      await omnibox.fill(`tepegoz://${page}`);
      await omnibox.press('Enter');

      await expect
        .poll(
          () =>
            pollEvaluate(
              () =>
                app.evaluate(
                  ({ webContents }, host) =>
                    webContents
                      .getAllWebContents()
                      .map((w) => w.getURL())
                      .join(' ')
                      .includes(`tepegoz://${host}`),
                  page,
                ),
              false,
            ),
          { timeout: 20_000 },
        )
        .toBe(true);

      await expect
        .poll(
          () =>
            pollEvaluate(
              () =>
                app.evaluate(({ webContents }, host) => {
                  const wc = webContents
                    .getAllWebContents()
                    .find((w) => w.getURL().startsWith(`tepegoz://${host}`));
                  if (wc === undefined || wc.isDestroyed()) return -1;
                  return wc.executeJavaScript('document.body.innerText.length');
                }, page),
              -1,
            ),
          { timeout: 20_000, message: `tepegoz://${page} never rendered real content` },
        )
        .toBeGreaterThan(0);

      // A privileged IPC call actually resolves from this page — not just "some text rendered". Every
      // migrated surface fetches its own data via `window.tepegoz.*` on mount; a call rejected by the IPC
      // sender allow-list (an untrusted-sender 403) leaves the surface stuck on its own loading fallback
      // forever, which the innerText check above cannot tell apart from real content (found 2026-08-27:
      // `isTrustedAppUrl` never learned the `tepegoz://` scheme, so every real page's data fetch silently
      // failed this exact way).
      const bridgeOk = await app.evaluate(({ webContents }, host) => {
        const wc = webContents.getAllWebContents().find((w) => w.getURL().startsWith(`tepegoz://${host}`));
        if (wc === undefined || wc.isDestroyed()) return false;
        return wc.executeJavaScript('window.tepegoz.getPreferences().then(() => true, () => false)');
      }, page);
      expect(bridgeOk, `tepegoz://${page}'s IPC bridge call was rejected`).toBe(true);

      // Reload with a console-message collector attached BEFORE the reload, so a CSP violation fired
      // during React's render is caught rather than missed by attaching only after the fact. This is
      // what actually caught the two real bugs that shipped once (2026-08-26, see protocol.ts's doc
      // comment): a naive embed of the built bundle silently split one inline <script> into three via
      // "$&"-pattern substitution, and separately let an accidental "<script>" inside the bundle end the
      // tag early — both produced a page that STILL rendered SOME content (so `innerText.length > 0`
      // above didn't catch them) but was actively failing to load its own code correctly underneath.
      const violations = await app.evaluate(({ webContents }, host) => {
        const wc = webContents.getAllWebContents().find((w) => w.getURL().startsWith(`tepegoz://${host}`));
        if (wc === undefined) return Promise.resolve([] as string[]);
        return new Promise<string[]>((resolve) => {
          const seen: string[] = [];
          const onMessage = (_e: unknown, _level: number, message: string): void => {
            if (message.toLowerCase().includes('content security policy')) seen.push(message);
          };
          wc.on('console-message', onMessage);
          wc.reload();
          wc.once('dom-ready', () => {
            setTimeout(() => {
              wc.removeListener('console-message', onMessage);
              resolve(seen);
            }, 500);
          });
        });
      }, page);
      expect(violations, `CSP violation(s) on tepegoz://${page}`).toEqual([]);
    }
  } finally {
    await app.close();
    rmSync(profileDir, { recursive: true, force: true });
  }
});
