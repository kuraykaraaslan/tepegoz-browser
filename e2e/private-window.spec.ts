import { resolve, join } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { test, expect, _electron as electron, type ElectronApplication } from '@playwright/test';
import { DatabaseSync } from 'node:sqlite';
import { pollEvaluate } from './poll-evaluate';

/**
 * Private (disposable) browsing, measured in the launched app.
 *
 * The DoD line says an ephemeral session that "leaves nothing on close". THREE separate stores could
 * each break that, and only the first is covered by the partition name:
 *
 *  1. **Cookies / cache / site storage** — the partition has no `persist:` prefix, so Electron keeps it
 *     in memory. Asserted here on the live session object, not on the string that names it.
 *  2. **Browsing history** — a different SQLite store the tab model writes on every navigation.
 *  3. **The session snapshot** — a third store, which would have recorded every private URL and then
 *     REOPENED those tabs on the next launch, in an ordinary window.
 *
 * A unit test can read the guards. Only a running app can show that a real navigation in a real private
 * window leaves all three alone — which is the difference this repo keeps insisting on.
 */

const appDir = resolve(process.cwd(), 'apps/desktop');

function guiEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined && k !== 'ELECTRON_RUN_AS_NODE') env[k] = v;
  }
  return env;
}

test('a private window leaves nothing an ordinary window would leave', async () => {
  const server: Server = createServer((_req, res) => {
    res.writeHead(200, {
      'content-type': 'text/html',
      // A cookie, so the "in memory" claim is about something the page actually stored.
      'set-cookie': 'privacy=secret; Path=/',
    });
    res.end('<!doctype html><html><head><title>secret</title></head><body>secret</body></html>');
  });
  await new Promise<void>((r) => {
    server.listen(0, '127.0.0.1', () => {
      r();
    });
  });
  const port = (server.address() as AddressInfo).port;
  const origin = `http://127.0.0.1:${String(port)}`;
  const dir = join(process.cwd(), '.private-window-profile');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'preferences.json'), '{}');

  const app: ElectronApplication = await electron.launch({
    args: [`--user-data-dir=${dir}`, appDir],
    env: guiEnv(),
  });
  let closed = false;
  try {
    const first = await app.firstWindow();
    await expect(first.getByRole('combobox').first()).toBeVisible();

    // Through the real IPC the chrome uses — not a test-only backdoor.
    await first.evaluate(async () => {
      await (
        window as unknown as { tepegoz: { openPrivateWindow: () => Promise<void> } }
      ).tepegoz.openPrivateWindow();
    });

    await expect
      .poll(
        () =>
          pollEvaluate(
            () => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length),
            0,
          ),
        { timeout: 15_000 },
      )
      .toBeGreaterThanOrEqual(2);

    // Find the private window BY ITS BADGE. Window order is not a reliable identifier here, and using
    // the badge doubles as proof that the disclosure surface the DoD line requires actually rendered —
    // an earlier draft of this spec took the last window in the list and silently drove the ordinary
    // one, which is how it read `isPersistent: true` and looked like a real leak.
    let privateWin = null as (typeof app.windows)[number] extends never
      ? never
      : Awaited<ReturnType<typeof app.firstWindow>> | null;
    await expect
      .poll(
        async () => {
          for (const page of app.windows()) {
            if ((await page.getByText('Private', { exact: true }).count()) > 0) {
              privateWin = page;
              return true;
            }
          }
          return false;
        },
        { timeout: 15_000 },
      )
      .toBe(true);
    if (privateWin === null) throw new Error('no private window');

    // Navigate the private window's tab to the probe origin.
    const omnibox = privateWin.getByRole('combobox').first();
    await expect(omnibox).toBeVisible();
    await omnibox.fill(`${origin}/`);
    await omnibox.press('Enter');

    await expect
      .poll(
        () =>
          pollEvaluate(
            () =>
              app.evaluate(
                ({ webContents }, n) =>
                  webContents.getAllWebContents().some((w) => w.getURL().includes(n)),
                '127.0.0.1',
              ),
            false,
          ),
        { timeout: 15_000 },
      )
      .toBe(true);

    const seen = (await app.evaluate(
      async ({ session, webContents }, args) => {
        const out: Record<string, unknown> = {};
        const wc = webContents.getAllWebContents().find((w) => w.getURL().includes(args.needle));
        if (wc === undefined) throw new Error('the probe page never became a webContents');

        // (1) The page IS on a private, non-persisted partition — read off the live session.
        const ses = wc.session;
        out.storagePath = ses.storagePath; // null for an in-memory session
        out.isPersistent = ses.isPersistent();

        // The cookie really was set, so "in memory" is a claim about real data rather than about
        // nothing having happened.
        out.cookies = (await ses.cookies.get({ name: 'privacy' })).length;

        // …and it is NOT in the ordinary browsing jar. Reading through `fromPartition` on the base
        // partition is what a leak between the two would look like.
        const direct = session.fromPartition('persist:tepegoz-web');
        out.cookiesInOrdinaryJar = (await direct.cookies.get({ name: 'privacy' })).length;
        return out;
      },
      { needle: '127.0.0.1' },
    )) as Record<string, unknown>;

    // An in-memory Electron session reports no storage path and is not persistent. This is the
    // property the whole feature rests on, checked on the object rather than inferred from its name.
    expect(seen.isPersistent).toBe(false);
    expect(seen.storagePath).toBeNull();
    expect(seen.cookies).toBe(1); // the page really did store something
    expect(seen.cookiesInOrdinaryJar).toBe(0); // and it did not reach the ordinary jar

    // (2) + (3) The two SQLite stores the partition does NOT cover. Read from the real database
    // file after the app has closed — a fresher check than asking the app about its own writes.
    await app.close();
    closed = true;
    const rows = readHistoryAndSession(join(dir, 'tepegoz.db'));
    // The private page must appear in NEITHER. History would be a permanent record of exactly what was
    // browsed; the session snapshot would additionally REOPEN it, in an ordinary window, at next launch.
    expect(rows.history.filter((u) => u.includes(String(port)))).toEqual([]);
    expect(rows.sessionJson).not.toContain(String(port));
  } finally {
    if (!closed) await app.close().catch(() => undefined);
    server.close();
  }
});

/**
 * The two stores read straight off disk. `node:sqlite` is what the app itself uses, so this is the same
 * reader answering the same file — no second implementation to drift.
 */
function readHistoryAndSession(dbPath: string): { history: string[]; sessionJson: string } {
  const db = new DatabaseSync(dbPath, { readOnly: true });
  try {
    const history = (db.prepare('SELECT url FROM history').all() as { url: string }[]).map(
      (r) => r.url,
    );
    const session = db.prepare("SELECT value FROM meta WHERE key = 'session'").get() as
      { value: string } | undefined;
    return { history, sessionJson: session?.value ?? '' };
  } finally {
    db.close();
  }
}
