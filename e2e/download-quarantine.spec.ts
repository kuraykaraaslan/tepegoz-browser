import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join, resolve } from 'node:path';
import { test, expect, _electron as electron, type ElectronApplication } from '@playwright/test';

/**
 * A download a SITE starts is quarantined, end to end (ADR-0040): it lands in a private quarantine directory
 * — never the user's own Downloads folder — gets a SHA-256 and a risk rating, and cannot be opened until it
 * is released (which, for an executable, takes a human confirmation this spec cannot give and does not try).
 *
 * The unit suites cover each rule on its own. What only a running app shows is the chain: Electron's
 * `will-download`, the quarantine path actually being used, the hash being of the bytes on disk, and the
 * "open" command really refusing — with `shell.openPath` replaced by a recorder so a missed refusal would
 * show up as a launched file rather than a silent pass.
 */

const appDir = resolve(process.cwd(), 'apps/desktop');
const BODY = Buffer.concat([Buffer.from('MZ'), Buffer.alloc(4096, 0x41)]); // an "executable" by name and magic

function guiEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined && k !== 'ELECTRON_RUN_AS_NODE') env[k] = v;
  }
  return env;
}

interface Bridge {
  createTab(url: string): void;
  listDownloads(): Promise<
    {
      id: string;
      filename: string;
      status: string;
      risk: string;
      trustVerdict: string;
      sha256?: string;
      provenance: { actor: string };
    }[]
  >;
  commandDownload(input: { id: string; action: string }): Promise<void>;
}

test('a site-triggered download is quarantined, hashed, rated, kept out of Downloads, and cannot be opened', async () => {
  test.setTimeout(150_000);

  const server: Server = createServer((_req, res) => {
    res.writeHead(200, {
      'content-type': 'application/octet-stream',
      'content-disposition': 'attachment; filename="setup.exe"',
      'content-length': String(BODY.length),
    });
    res.end(BODY);
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  const url = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}/setup.exe`;

  const profileDir = join(process.cwd(), '.download-quarantine-profile');
  rmSync(profileDir, { recursive: true, force: true });
  mkdirSync(profileDir, { recursive: true });
  writeFileSync(join(profileDir, 'preferences.json'), '{}');

  const app: ElectronApplication = await electron.launch({
    args: [`--user-data-dir=${profileDir}`, appDir],
    env: guiEnv(),
  });
  try {
    const page = await app.firstWindow();
    await expect(page.getByRole('combobox').first()).toBeVisible();

    // Record anything the app tries to launch, so a missed refusal is visible.
    await app.evaluate(({ shell }) => {
      const g = globalThis as unknown as { __opened: string[] };
      g.__opened = [];
      shell.openPath = (p: string) => {
        g.__opened.push(p);
        return Promise.resolve('');
      };
    });

    await page.evaluate((u: string) => {
      (window as unknown as { tepegoz: Bridge }).tepegoz.createTab(u);
    }, url);

    const list = () =>
      page.evaluate(() => (window as unknown as { tepegoz: Bridge }).tepegoz.listDownloads());
    await expect
      .poll(async () => (await list()).find((d) => d.filename === 'setup.exe')?.status, {
        timeout: 30_000,
      })
      .toBe('quarantined');
    const record = (await list()).find((d) => d.filename === 'setup.exe')!;

    // Rated and hashed, from a SITE, with no verdict claimed (the Safe Browsing key is not configured).
    expect(record.risk).toBe('executable');
    expect(record.provenance.actor).toBe('site');
    expect(record.trustVerdict).toBe('unknown');
    const expectedSha = createHash('sha256').update(BODY).digest('hex');
    expect(record.sha256).toBe(expectedSha);

    // In the private quarantine directory, byte-for-byte what the server sent …
    const quarantineDir = join(profileDir, 'Downloads', 'quarantine');
    const stored = readdirSync(quarantineDir).filter((n) => n.endsWith('setup.exe'));
    expect(stored).toHaveLength(1);
    expect(readFileSync(join(quarantineDir, stored[0]!)).equals(BODY)).toBe(true);

    // … and NOT in the user's own Downloads folder.
    const userDownloads = await app.evaluate(({ app: a }) => a.getPath('downloads'));
    expect(existsSync(join(userDownloads, 'setup.exe'))).toBe(false);

    // "Open" is refused while quarantined: the record stays quarantined and nothing was launched.
    await page
      .evaluate(
        (id: string) =>
          (window as unknown as { tepegoz: Bridge }).tepegoz.commandDownload({
            id,
            action: 'open',
          }),
        record.id,
      )
      .catch(() => undefined);
    await new Promise((r) => setTimeout(r, 800));
    expect((await list()).find((d) => d.id === record.id)?.status).toBe('quarantined');
    const opened = await app.evaluate(
      () => (globalThis as unknown as { __opened: string[] }).__opened,
    );
    expect(opened).toEqual([]);
  } finally {
    await app.close().catch(() => undefined);
    await new Promise<void>((r) => server.close(() => r()));
    try {
      rmSync(profileDir, { recursive: true, force: true });
    } catch {
      /* the next run clears it */
    }
  }
});
