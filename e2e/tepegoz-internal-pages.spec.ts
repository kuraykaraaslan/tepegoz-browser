import { resolve, join } from 'node:path';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { test, expect, _electron as electron, type ElectronApplication } from '@playwright/test';
import { pollEvaluate } from './poll-evaluate';

/**
 * Faz 3 of phases/tracks/protocol-tepegoz-pages.md: extensions/history/downloads/uploads/bookmarks
 * migrated to real pages the same way settings was (`e2e/tepegoz-settings-page.spec.ts` covers the
 * settings-specific context-menu acceptance criterion); `tepegoz://process` (the Phase 2b Task
 * Manager) is a later real page added the same way. This file's job is narrower and applies to all of
 * them at once: each host renders real content through the SAME inlined-document mechanism
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

const PAGES = ['extensions', 'history', 'downloads', 'uploads', 'bookmarks', 'process', 'developer'];

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

/**
 * A `tepegoz://` page is an app shell, not a document: it fills the view exactly and scrolls INSIDE its
 * own panes. So its document must never itself be scrollable — if it is, a wheel over the page slides
 * the entire shell (sidebar title, search box, table header) up out of view, which is precisely what a
 * short window did on 2026-09-02.
 *
 * The cause was subtle enough to be worth a permanent test: Tailwind's `sr-only` is `position:absolute`,
 * and an absolutely positioned element resolves its containing block to the nearest POSITIONED ancestor
 * — not to the scroll container it happens to sit in. `DataTable`'s `sr-only` caption (and the
 * appearance section's `sr-only` colour input) therefore escaped their `overflow-auto` pane, landed on
 * the page-level surface box, and added their offset to the document's scroll height. Fixed by
 * containing them locally (`relative` on the wrapper) and by making each `*PageSurface` shell `fixed`,
 * which is excluded from document scroll height by construction.
 */
test('no tepegoz:// page makes its own document scrollable at a short window', async () => {
  const profileDir = join(process.cwd(), '.tepegoz-page-scroll-profile');
  mkdirSync(profileDir, { recursive: true });
  writeFileSync(join(profileDir, 'preferences.json'), '{"locale":"en"}');

  const app: ElectronApplication = await electron.launch({
    args: [`--user-data-dir=${profileDir}`, appDir],
    env: guiEnv(),
  });
  try {
    const window = await app.firstWindow();
    await expect(window.getByRole('banner')).toBeVisible();

    // A window short enough that every page's content exceeds its viewport — the regression only shows
    // when there IS something to scroll past.
    await app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0]?.setContentSize(1280, 480);
    });

    const omnibox = window.getByRole('combobox').first();
    for (const page of [...PAGES, 'settings']) {
      await omnibox.fill(`tepegoz://${page}`);
      await omnibox.press('Enter');

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
                  return wc.executeJavaScript(
                    'document.body.innerText.length > 0 ? document.scrollingElement.scrollHeight - document.scrollingElement.clientHeight : -1',
                  );
                }, page),
              -1,
            ),
          { timeout: 20_000, message: `tepegoz://${page} never rendered` },
        )
        .toBeGreaterThan(-1);

      const overflow = await app.evaluate(({ webContents }, host) => {
        const wc = webContents
          .getAllWebContents()
          .find((w) => w.getURL().startsWith(`tepegoz://${host}`));
        if (wc === undefined || wc.isDestroyed()) return -1;
        return wc.executeJavaScript(
          'document.scrollingElement.scrollHeight - document.scrollingElement.clientHeight',
        );
      }, page);
      const why = `tepegoz://${page}'s own document scrolls by ${overflow}px`;
      expect(overflow, why).toBeLessThanOrEqual(0);
    }
  } finally {
    await app.close();
    rmSync(profileDir, { recursive: true, force: true });
  }
});
