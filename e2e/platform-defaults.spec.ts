import { resolve, join } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { test, expect, _electron as electron, type ElectronApplication } from '@playwright/test';
import { pollEvaluate } from './poll-evaluate';

/**
 * What a browsed page can reach — measured by asking a REAL page in the launched app, not by reading
 * the handlers we happen to have written.
 *
 * `docs/threat-model.md` names the class this locks: Electron supplies a behaviour when the app
 * installs no handler, and **the absence of a call is invisible to every gate we have** — a linter, a
 * type checker and a unit test all read the code that IS there. Two holes had already been found that
 * way in this repo (the default application menu binding Ctrl+Shift+I around the DevTools gate, and
 * `select-client-certificate` sending the user's identity certificate unasked), so the remaining
 * web-platform surfaces were swept the same way rather than assumed safe.
 *
 * The sweep found no further hole. That is a result worth committing, not worth trusting: the point of
 * the file is that "no hole" stops being a belief and becomes something a run can contradict.
 * `security.test.ts` locks the app's half (deny-by-default for every permission but three); this locks
 * what the WEB actually gets.
 */

const appDir = resolve(process.cwd(), 'apps/desktop');

function guiEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined && k !== 'ELECTRON_RUN_AS_NODE') env[k] = v;
  }
  return env;
}

/** Each probe gets its own deadline: a surface that never settles is a distinct outcome from one that
 *  refuses, and one hung await would otherwise take the whole spec down with it. */
const PROBE = `(async () => {
  const out = {};
  const probe = async (name, fn) => {
    const deadline = new Promise((r) => setTimeout(() => r('__PENDING__'), 4000));
    try {
      const v = await Promise.race([fn(), deadline]);
      out[name] = v === '__PENDING__' ? 'pending' : 'resolved';
    } catch (e) { out[name] = 'rejected:' + (e && e.name); }
  };
  await probe('getDisplayMedia', async () => {
    const s = await navigator.mediaDevices.getDisplayMedia({ video: true });
    s.getTracks().forEach((t) => t.stop());
    return true;
  });
  await probe('getUserMedia', async () => {
    const s = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    s.getTracks().forEach((t) => t.stop());
    return true;
  });
  await probe('usb', () => navigator.usb.requestDevice({ filters: [] }));
  await probe('bluetooth', () => navigator.bluetooth.requestDevice({ acceptAllDevices: true }));
  await probe('serial', () => navigator.serial.requestPort());
  await probe('hid', async () => {
    out.hidDeviceCount = (await navigator.hid.requestDevice({ filters: [] })).length;
    return true;
  });
  await probe('geolocation', () => new Promise((res, rej) =>
    navigator.geolocation.getCurrentPosition(() => res(true), (e) => rej(new Error('code ' + e.code)), { timeout: 3000 })));
  out.idleDetection = (await navigator.permissions.query({ name: 'idle-detection' })).state;
  out.notificationState = Notification.permission;
  out.nodeRequire = typeof require;
  out.nodeProcess = typeof process;
  out.nodeModule = typeof module;
  out.secureContext = window.isSecureContext;
  return out;
})()`;

test('a browsed page reaches nothing it has not been granted', async () => {
  const server: Server = createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end('<!doctype html><html><head><title>probe</title></head><body>probe</body></html>');
  });
  await new Promise<void>((r) => {
    server.listen(0, '127.0.0.1', () => {
      r();
    });
  });
  const origin = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`;
  const dir = join(process.cwd(), '.platform-defaults-profile');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'preferences.json'), '{}');

  const app: ElectronApplication = await electron.launch({
    args: [`--user-data-dir=${dir}`, appDir],
    env: guiEnv(),
  });
  try {
    const window = await app.firstWindow();
    const omnibox = window.getByRole('combobox').first();
    await expect(omnibox).toBeVisible();
    await omnibox.fill(`${origin}/`);
    await omnibox.press('Enter');
    await expect
      .poll(
        () =>
          pollEvaluate(
            () =>
              app.evaluate(
                ({ webContents }, needle) =>
                  webContents.getAllWebContents().some((w) => w.getURL().includes(needle)),
                '127.0.0.1',
              ),
            false,
          ),
        { timeout: 15_000 },
      )
      .toBe(true);

    const seen = (await app.evaluate(
      async ({ webContents }, args) => {
        const wc = webContents.getAllWebContents().find((w) => w.getURL().includes(args.needle));
        if (wc === undefined) throw new Error('the probe page never became a webContents');
        // `true` = user gesture. Without it several of these refuse for the WRONG reason (no
        // activation) and the spec would pass while proving nothing.
        return (await wc.executeJavaScript(args.code, true)) as Record<string, unknown>;
      },
      { needle: '127.0.0.1', code: PROBE },
    )) as Record<string, unknown>;

    // A localhost origin IS a secure context, so every API below was genuinely available to be asked
    // for. Without this the whole spec could pass because the page was not eligible in the first place.
    expect(seen.secureContext).toBe(true);

    // Camera, microphone and the screen: refused by the deny-by-default permission handler.
    expect(seen.getUserMedia).toBe('rejected:NotAllowedError');
    expect(seen.getDisplayMedia).toBe('rejected:NotAllowedError');
    expect(seen.geolocation).toBe('rejected:Error');

    // Device access. These are safe by a different mechanism: the app installs no device-selection
    // handler, so no device is ever chosen, and the request fails for want of one.
    expect(seen.usb).toBe('rejected:NotFoundError');
    expect(seen.bluetooth).toBe('rejected:NotFoundError');
    expect(seen.serial).toBe('rejected:NotFoundError');
    // WebHID is the odd one out and the reason this assertion names a COUNT: `requestDevice` resolves
    // with an empty array rather than rejecting when nothing is selected. "Resolved" alone would have
    // read as a grant; it is not one.
    expect(seen.hid).toBe('resolved');
    expect(seen.hidDeviceCount).toBe(0);

    expect(seen.idleDetection).toBe('denied');
    expect(seen.notificationState).toBe('denied');

    // No Node in a browsed page — the renderer-is-untrusted claim, checked rather than asserted.
    expect(seen.nodeRequire).toBe('undefined');
    expect(seen.nodeProcess).toBe('undefined');
    expect(seen.nodeModule).toBe('undefined');
  } finally {
    await app.close();
    server.close();
  }
});
