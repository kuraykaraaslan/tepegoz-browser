import { mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join, resolve } from 'node:path';
import { test, expect, _electron as electron } from '@playwright/test';

/**
 * HTTP Basic authentication (401) goes through the trusted chrome, end to end (Phase 2c): the user is
 * asked in a dialog that names the origin and realm, Cancel means "do not authenticate", the right
 * credentials load the page — and the password is written nowhere in the profile.
 *
 * The unit suite covers the broker's branches against fakes. What only a running app shows is the whole
 * chain: Chromium's `login` event, the dialog the renderer draws, the answer reaching the request as an
 * `Authorization` header, and the credential staying out of persisted state.
 */

const appDir = resolve(process.cwd(), 'apps/desktop');
const USER = 'alice';
const PASSWORD = 'correct-horse-9f3b';
const EXPECTED = `Basic ${Buffer.from(`${USER}:${PASSWORD}`).toString('base64')}`;

function guiEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined && k !== 'ELECTRON_RUN_AS_NODE') env[k] = v;
  }
  return env;
}

/** Every file under `dir` (best effort — Chromium may hold some open) that contains any needle. */
function filesContaining(dir: string, needles: string[]): string[] {
  const found: string[] = [];
  const walk = (d: string): void => {
    for (const name of readdirSync(d)) {
      const p = join(d, name);
      try {
        if (statSync(p).isDirectory()) walk(p);
        else {
          const text = readFileSync(p).toString('latin1');
          if (needles.some((n) => text.includes(n))) found.push(p);
        }
      } catch {
        /* a file Chromium holds or removed mid-walk */
      }
    }
  };
  walk(dir);
  return found;
}

test('a 401 asks in the chrome; Cancel does not authenticate; the right credentials load; nothing is persisted', async () => {
  test.setTimeout(150_000);

  const auths: (string | undefined)[] = [];
  const server: Server = createServer((req, res) => {
    auths.push(req.headers.authorization);
    if (req.headers.authorization !== EXPECTED) {
      res.writeHead(401, { 'www-authenticate': 'Basic realm="Vault"' });
      res.end('denied');
      return;
    }
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end('<!doctype html><title>PrivateArea</title>welcome');
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  const url = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}/`;

  const profileDir = join(process.cwd(), '.basic-auth-profile');
  rmSync(profileDir, { recursive: true, force: true });
  mkdirSync(profileDir, { recursive: true });
  writeFileSync(join(profileDir, 'preferences.json'), '{}');

  const app = await electron.launch({
    args: [`--user-data-dir=${profileDir}`, appDir],
    env: guiEnv(),
  });
  let leaked: string[] = [];
  try {
    const page = await app.firstWindow();
    const box = page.getByRole('combobox').first();
    await expect(box).toBeVisible();
    const dialog = page.getByRole('dialog');

    // 1. The challenge raises a dialog that says WHO is asking and for what realm.
    await box.fill(url);
    await box.press('Enter');
    await expect(dialog).toContainText('Realm: Vault', { timeout: 30_000 });
    await expect(dialog).toContainText(new URL(url).origin);

    // 2. Cancel = do not authenticate: no credentialed request, no page.
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await new Promise((r) => setTimeout(r, 1500));
    expect(auths.every((a) => a === undefined)).toBe(true);
    await expect(page.getByRole('tab', { name: /PrivateArea/ })).toHaveCount(0);

    // 3. Right credentials: the request carries them and the page loads.
    await box.fill(url);
    await box.press('Enter');
    await expect(dialog).toContainText('Realm: Vault', { timeout: 30_000 });
    await dialog.getByLabel('Username').fill(USER);
    await dialog.getByLabel('Password').fill(PASSWORD);
    await dialog.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('tab', { name: /PrivateArea/ })).toHaveCount(1, {
      timeout: 30_000,
    });
    expect(auths).toContain(EXPECTED);
  } finally {
    await app.close().catch(() => undefined);
    await new Promise<void>((r) => server.close(() => r()));
    // 4. The password is in no persisted file (preferences, journal, databases, logs).
    // The scan must be able to see a leak: plant the secret in a throwaway file first and require a hit.
    writeFileSync(join(profileDir, 'planted-control.txt'), PASSWORD);
    expect(filesContaining(profileDir, [PASSWORD])).toEqual([
      join(profileDir, 'planted-control.txt'),
    ]);
    rmSync(join(profileDir, 'planted-control.txt'));
    leaked = filesContaining(profileDir, [
      PASSWORD,
      Buffer.from(`${USER}:${PASSWORD}`).toString('base64'),
    ]);
    try {
      rmSync(profileDir, { recursive: true, force: true });
    } catch {
      /* the next run clears it */
    }
  }
  expect(leaked).toEqual([]);
});
