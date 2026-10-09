import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join, resolve } from 'node:path';
import { test, expect, _electron as electron } from '@playwright/test';

/**
 * Download controls act on the transfer itself, not just on its row (Download Manager, Phase 2c).
 *
 * A status badge that reads "paused" while bytes keep arriving, or "canceled" while the connection stays
 * open and a partial file stays on disk, is a control that lies. This drives a deliberately slow, very
 * large transfer and checks the wire and the disk:
 *
 *   pause   → received bytes stop growing; resume → they grow again (the control that makes "stopped"
 *             mean something);
 *   cancel  → the server sees the connection close, and no file for it remains in quarantine.
 */

const appDir = resolve(process.cwd(), 'apps/desktop');
const CHUNK = Buffer.alloc(8192, 0x43);

function guiEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined && k !== 'ELECTRON_RUN_AS_NODE') env[k] = v;
  }
  return env;
}

interface Row {
  id: string;
  filename: string;
  status: string;
  receivedBytes: number;
}
interface Bridge {
  createTab(url: string): void;
  listDownloads(): Promise<Row[]>;
  commandDownload(input: { id: string; action: string }): Promise<void>;
}

test('pause stops the bytes, resume restarts them, cancel closes the connection and leaves no file', async () => {
  test.setTimeout(150_000);

  let closed = false;
  const server: Server = createServer((_req, res) => {
    res.writeHead(200, {
      'content-type': 'application/octet-stream',
      'content-disposition': 'attachment; filename="big.bin"',
      'content-length': String(1024 * 1024 * 1024),
    });
    const timer = setInterval(() => res.write(CHUNK), 40);
    res.on('close', () => {
      closed = true;
      clearInterval(timer);
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  const url = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}/big.bin`;

  const profileDir = join(process.cwd(), '.download-controls-profile');
  rmSync(profileDir, { recursive: true, force: true });
  mkdirSync(profileDir, { recursive: true });
  writeFileSync(join(profileDir, 'preferences.json'), '{}');

  const app = await electron.launch({
    args: [`--user-data-dir=${profileDir}`, appDir],
    env: guiEnv(),
  });
  try {
    const page = await app.firstWindow();
    await expect(page.getByRole('combobox').first()).toBeVisible();
    const list = (): Promise<Row[]> =>
      page.evaluate(() => (window as unknown as { tepegoz: Bridge }).tepegoz.listDownloads());
    const command = (id: string, action: string): Promise<void> =>
      page.evaluate(
        ({ id: i, action: a }) =>
          (window as unknown as { tepegoz: Bridge }).tepegoz.commandDownload({ id: i, action: a }),
        { id, action },
      );
    const row = async (): Promise<Row | undefined> =>
      (await list()).find((d) => d.filename === 'big.bin');

    await page.evaluate((u: string) => {
      (window as unknown as { tepegoz: Bridge }).tepegoz.createTab(u);
    }, url);
    await expect.poll(async () => (await row())?.status, { timeout: 30_000 }).toBe('in_progress');
    const id = (await row())!.id;
    await expect
      .poll(async () => (await row())?.receivedBytes ?? 0, { timeout: 30_000 })
      .toBeGreaterThan(0);

    // Pause: the byte count stops moving.
    await command(id, 'pause');
    expect((await row())?.status).toBe('paused');
    await new Promise((r) => setTimeout(r, 500)); // let in-flight data drain
    const frozen = (await row())!.receivedBytes;
    await new Promise((r) => setTimeout(r, 1500));
    expect((await row())!.receivedBytes).toBe(frozen);

    // Control: resume, and it moves again.
    await command(id, 'resume');
    await expect
      .poll(async () => (await row())?.receivedBytes ?? 0, { timeout: 30_000 })
      .toBeGreaterThan(frozen);

    // The disk detector is sighted: while the transfer runs, its file IS in quarantine.
    const quarantineDir = join(profileDir, 'Downloads', 'quarantine');
    const present = (): string[] =>
      existsSync(quarantineDir)
        ? readdirSync(quarantineDir).filter((n) => n.includes('big.bin'))
        : [];
    expect(present().length).toBeGreaterThan(0);

    // Cancel: the row says so, the server sees the connection go, and nothing is left in quarantine.
    await command(id, 'cancel');
    expect((await row())?.status).toBe('canceled');
    await expect.poll(() => closed, { timeout: 15_000 }).toBe(true);
    // Chromium removes the partial file asynchronously after the cancel, so poll rather than sample once.
    await expect.poll(present, { timeout: 15_000 }).toEqual([]);
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
