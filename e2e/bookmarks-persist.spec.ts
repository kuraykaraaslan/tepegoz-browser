import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { test, expect, _electron as electron, type ElectronApplication } from '@playwright/test';
import { chromePage } from './chrome-page';

/**
 * Bookmarks, across a restart (Phase 2c): what is saved is still there next launch; only an allow-listed
 * scheme can be saved (http(s), file://, tepegoz://; a `javascript:`/`data:` URL is refused, not
 * stored); and the export a user
 * hands to another browser escapes a hostile page title instead of carrying it as markup.
 *
 * Each refusal is paired with an acceptance on the same bridge call, so "rejected" cannot be an artefact
 * of the call failing for some unrelated reason.
 */

const appDir = resolve(process.cwd(), 'apps/desktop');
const GOOD_URL = 'https://example.test/saved';
const HOSTILE_TITLE = '<img src=x onerror=alert(1)> & "quoted"';

function guiEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined && k !== 'ELECTRON_RUN_AS_NODE') env[k] = v;
  }
  return env;
}

interface Bridge {
  toggleBookmark(url: string, title: string): Promise<boolean>;
  isBookmarked(url: string): Promise<boolean>;
  listBookmarks(): Promise<{ url: string; title: string }[]>;
  exportBookmarks(): Promise<string>;
}

test('bookmarks persist, refuse executable schemes, and export without live markup', async () => {
  test.setTimeout(150_000);

  const profileDir = join(process.cwd(), '.bookmarks-profile');
  rmSync(profileDir, { recursive: true, force: true });
  mkdirSync(profileDir, { recursive: true });
  writeFileSync(join(profileDir, 'preferences.json'), '{}');

  const launch = (): Promise<ElectronApplication> =>
    electron.launch({ args: [`--user-data-dir=${profileDir}`, appDir], env: guiEnv() });
  const chrome = async (app: ElectronApplication) => {
    const page = await chromePage(app);
    await expect(page.getByRole('combobox').first()).toBeVisible();
    return page;
  };
  const call = <T>(
    page: Awaited<ReturnType<typeof chrome>>,
    name: keyof Bridge,
    ...args: unknown[]
  ): Promise<T> =>
    page.evaluate(
      ({ n, a }) =>
        (window as unknown as { tepegoz: Record<string, (...x: unknown[]) => unknown> }).tepegoz[
          n
        ]!(...a),
      { n: name, a: args },
    ) as Promise<T>;

  try {
    let app = await launch();
    let page = await chrome(app);

    // Acceptance first: a web page saves.
    expect(await call<boolean>(page, 'toggleBookmark', GOOD_URL, HOSTILE_TITLE)).toBe(true);
    expect(await call<boolean>(page, 'isBookmarked', GOOD_URL)).toBe(true);

    // Refusals: schemes that could execute or smuggle content are not stored. (tepegoz:// and file:// ARE
    // bookmarkable by design — a bookmark is a stored pointer — so they are not in this list.)
    for (const bad of [
      'javascript:alert(1)',
      'data:text/html,<script>1</script>',
      'blob:https://x.test/1',
      'about:blank',
    ]) {
      await call<boolean>(page, 'toggleBookmark', bad, 'bad').catch(() => undefined);
      const saved = await call<boolean>(page, 'isBookmarked', bad).catch(() => false);
      expect(saved).toBe(false);
    }
    expect((await call<{ url: string }[]>(page, 'listBookmarks')).map((b) => b.url)).toEqual([
      GOOD_URL,
    ]);

    // The export is markup for another browser: the hostile title must be escaped, not live.
    const html = await call<string>(page, 'exportBookmarks');
    expect(html).toContain(GOOD_URL);
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img');

    await app.close();

    // Restart: still there.
    app = await launch();
    page = await chrome(app);
    expect(await call<boolean>(page, 'isBookmarked', GOOD_URL)).toBe(true);
    expect((await call<{ title: string }[]>(page, 'listBookmarks'))[0]?.title).toBe(HOSTILE_TITLE);
    await app.close();
  } finally {
    try {
      rmSync(profileDir, { recursive: true, force: true });
    } catch {
      /* the next run clears it */
    }
  }
});
