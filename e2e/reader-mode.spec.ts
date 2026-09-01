import { join, resolve } from 'node:path';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { test, expect, _electron as electron, type ElectronApplication } from '@playwright/test';
import { pollEvaluate } from './poll-evaluate';

const appDir = resolve(process.cwd(), 'apps/desktop');

function guiEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined && k !== 'ELECTRON_RUN_AS_NODE') env[k] = v;
  }
  return env;
}

/** `reader:toggle` — main→chrome-renderer, the exact message the page right-click "Reading view" row
 *  sends (`page-context-menu.ts`). Driven here directly because the native context menu is not
 *  reachable from Playwright. */
const READER_TOGGLE_CHANNEL = 'reader:toggle';

/** An article-shaped page: an <article> wrapper (the extractor scores that +30) with enough prose to
 *  clear MIN_ARTICLE_CHARS (250) and no links, so extraction returns a real ReaderArticle. */
const ARTICLE_HTML = `<!doctype html><html><head><title>The Tide Clock</title></head><body>
<nav><span>home</span><span>about</span></nav>
<article>
  <h1>The Tide Clock</h1>
  <p>A tide clock is a specially calibrated timepiece that tracks the average movement of the moon
     rather than the sun, completing one full rotation roughly every twelve hours and twenty-five
     minutes.</p>
  <p>Because the lunar day is longer than the solar day, a tide clock drifts steadily against an
     ordinary wall clock, which is exactly the behaviour its owner wants from it near the coast.</p>
  <p>Calibration is done at a known high tide: the single hand is set to the top of the dial and the
     mechanism then keeps pace with the semidiurnal rhythm of most Atlantic coastlines.</p>
  <p>Tide clocks are far less useful on coastlines with mixed or diurnal tides, where a single
     averaged period cannot represent two unequal highs and lows in the same day.</p>
</article>
<footer><span>copyright</span></footer>
</body></html>`;

/**
 * Reader mode, end to end (Phase 2c "reader mode ... works end-to-end"): toggling it on an
 * article-shaped page replaces the content area with the extracted reading view, and toggling a page
 * that is not an article says so rather than failing silently.
 */
test('reader mode opens the reading view on an article and declines on a non-article', async () => {
  test.setTimeout(120_000);

  const server: Server = createServer((req, res) => {
    if (req.url === '/app') {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end('<!doctype html><html><head><title>Dashboard</title></head><body><h1>Dashboard</h1><p>ok</p></body></html>');
      return;
    }
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end(ARTICLE_HTML);
  });
  await new Promise<void>((r) => {
    server.listen(0, '127.0.0.1', () => {
      r();
    });
  });
  const base = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`;

  const profileDir = join(process.cwd(), '.reader-profile');
  rmSync(profileDir, { recursive: true, force: true });
  mkdirSync(profileDir, { recursive: true });
  writeFileSync(join(profileDir, 'preferences.json'), '{}');

  const app: ElectronApplication = await electron.launch({
    args: [`--user-data-dir=${profileDir}`, appDir],
    env: guiEnv(),
  });

  const toggleReader = (): Promise<void> =>
    app.evaluate(({ BrowserWindow }, channel: string) => {
      const win = BrowserWindow.getAllWindows()[0];
      win?.webContents.send(channel);
    }, READER_TOGGLE_CHANNEL);

  try {
    const window = await app.firstWindow();
    const omnibox = window.getByRole('combobox').first();
    await expect(omnibox).toBeVisible();

    // ── An article → the reading view, with the extracted title as its heading ──────────────────
    await omnibox.fill(`${base}/article`);
    await omnibox.press('Enter');
    await expect
      .poll(
        () =>
          pollEvaluate(
            () =>
              app.evaluate(({ webContents }) =>
                webContents
                  .getAllWebContents()
                  .map((w) => w.getURL())
                  .join(' '),
              ),
            '',
          ),
        { timeout: 20_000 },
      )
      .toContain('/article');

    await toggleReader();
    const readingView = window.getByRole('article');
    await expect(readingView).toBeVisible({ timeout: 15_000 });
    await expect(
      readingView.getByRole('heading', { level: 1, name: 'The Tide Clock' }),
    ).toBeVisible();
    // A paragraph the extractor kept — proof it is the reading view, not the live page in an iframe.
    await expect(readingView.getByText(/lunar day is longer than the solar day/)).toBeVisible();

    // Toggle off — the overlay goes away and the page is untouched underneath.
    await toggleReader();
    await expect(readingView).toBeHidden({ timeout: 15_000 });

    // ── A non-article → the honest "this is not an article" copy, not a silent no-op ────────────
    await omnibox.fill(`${base}/app`);
    await omnibox.press('Enter');
    await expect
      .poll(
        () =>
          pollEvaluate(
            () =>
              app.evaluate(({ webContents }) =>
                webContents
                  .getAllWebContents()
                  .map((w) => w.getURL())
                  .join(' '),
              ),
            '',
          ),
        { timeout: 20_000 },
      )
      .toContain('/app');

    await toggleReader();
    // `role="article"` never mounts for a non-article; the decline copy does — and it names the PAGE
    // as the reason ("does not look like an article"), not a failure of the feature.
    await expect(
      window.getByRole('heading', { name: 'Nothing to read here' }),
    ).toBeVisible({ timeout: 15_000 });
    await expect(window.getByText(/does not look like an article/i)).toBeVisible();
    await expect(window.getByRole('article')).toHaveCount(0);
  } finally {
    await app.close();
    await new Promise<void>((r) => server.close(() => r()));
    rmSync(profileDir, { recursive: true, force: true });
  }
});
