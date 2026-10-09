import { resolve, join } from 'node:path';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { test, expect, _electron as electron, type ElectronApplication } from '@playwright/test';

/**
 * Autoplay policy, end to end. The page tries to start media with no click: an UNMUTED element is what the
 * default must refuse (`NotAllowedError`), a MUTED one is what every mainstream browser lets through, and
 * "Allow all autoplay" lets the unmuted one play too. The policy is a `webPreference` fixed when the tab's
 * view is created, so each case launches with its own preference and opens a fresh tab.
 *
 * The media is a tenth of a second of silent 8-bit WAV built here, so nothing is downloaded and no audio
 * file has to live in the repo.
 */

const appDir = resolve(process.cwd(), 'apps/desktop');

function guiEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined && k !== 'ELECTRON_RUN_AS_NODE') env[k] = v;
  }
  return env;
}

/** 800 samples of 8 kHz mono 8-bit silence, as a data: URL. */
function silentWavDataUrl(): string {
  const samples = 800;
  const h = Buffer.alloc(44);
  h.write('RIFF', 0);
  h.writeUInt32LE(36 + samples, 4);
  h.write('WAVEfmt ', 8);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20); // PCM
  h.writeUInt16LE(1, 22); // mono
  h.writeUInt32LE(8000, 24);
  h.writeUInt32LE(8000, 28);
  h.writeUInt16LE(1, 32);
  h.writeUInt16LE(8, 34);
  h.write('data', 36);
  h.writeUInt32LE(samples, 40);
  const body = Buffer.alloc(samples, 0x80); // 0x80 = silence for unsigned 8-bit
  return `data:audio/wav;base64,${Buffer.concat([h, body]).toString('base64')}`;
}

async function tryAutoplay(
  prefs: Record<string, unknown>,
  profileName: string,
): Promise<{ unmuted: string; muted: string }> {
  const server: Server = createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end('<!doctype html><title>AutoplayProbe</title><body>probe</body>');
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  const base = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`;
  const profileDir = join(process.cwd(), profileName);
  rmSync(profileDir, { recursive: true, force: true });
  mkdirSync(profileDir, { recursive: true });
  writeFileSync(join(profileDir, 'preferences.json'), JSON.stringify(prefs));
  const app: ElectronApplication = await electron.launch({
    args: [`--user-data-dir=${profileDir}`, appDir],
    env: guiEnv(),
  });
  try {
    const page = await app.firstWindow();
    await expect(page.getByRole('combobox').first()).toBeVisible();
    // Opened programmatically, NOT typed into the address bar: a user-initiated navigation gives the new
    // document user activation, which would let sound autoplay under every policy and make this test
    // measure nothing.
    await page.evaluate((u: string) => {
      (window as unknown as { tepegoz: { createTab(u: string): void } }).tepegoz.createTab(u);
    }, `${base}/`);
    await expect(page.getByRole('tab', { name: /AutoplayProbe/ })).toHaveCount(1, {
      timeout: 30_000,
    });
    return await app.evaluate(async ({ webContents }, src: string) => {
      const wc = webContents.getAllWebContents().find((w) => w.getURL().includes('127.0.0.1'));
      if (wc === undefined) throw new Error('probe page not found');
      // `userGesture` false: this is the page acting on its own, which is exactly what is being policed.
      const script = `(async () => {
        // Muted autoplay is only auto-allowed for <video> (Chromium's rule), so the muted attempt uses one;
        // an audio-only source plays in a <video> just the same.
        const attempt = async (muted) => {
          const a = muted ? document.createElement('video') : new Audio();
          a.src = ${JSON.stringify('__SRC__')};
          a.muted = muted;
          try { await a.play(); return 'played'; } catch (e) { return e.name; }
        };
        return { unmuted: await attempt(false), muted: await attempt(true) };
      })()`.replace('__SRC__', src);
      return (await wc.executeJavaScript(script, false)) as { unmuted: string; muted: string };
    }, silentWavDataUrl());
  } finally {
    await app.close().catch(() => undefined);
    await new Promise<void>((r) => server.close(() => r()));
    try {
      rmSync(profileDir, { recursive: true, force: true });
    } catch {
      /* the next run clears it */
    }
  }
}

test('by default sound needs a click but muted video may play; "allow" lets sound play too', async () => {
  test.setTimeout(240_000);
  const byDefault = await tryAutoplay({}, '.autoplay-default-profile');
  expect(byDefault).toEqual({ unmuted: 'NotAllowedError', muted: 'played' });

  const allowed = await tryAutoplay({ autoplayPolicy: 'allow' }, '.autoplay-allow-profile');
  expect(allowed).toEqual({ unmuted: 'played', muted: 'played' });
});
