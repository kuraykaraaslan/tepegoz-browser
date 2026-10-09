import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:https';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test, expect, _electron as electron } from '@playwright/test';

/**
 * A page behind an untrusted TLS certificate is not loaded until the user says so (certificate broker,
 * Phase 2c). Two properties, each against a real HTTPS origin with a self-signed certificate:
 *
 *   1. **Refused by default.** Opening the URL raises the warning and the origin receives NOT ONE request —
 *      no page, no favicon — because the handshake is held until the user answers.
 *   2. **"Go back" keeps it refused; "Continue anyway" loads it.** The proceed path is the control that
 *      makes (1) a measurement: it proves the origin is reachable and the page would have loaded.
 *
 * The certificate is generated per run with `openssl`; no certificate is committed.
 */

const appDir = resolve(process.cwd(), 'apps/desktop');

function guiEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined && k !== 'ELECTRON_RUN_AS_NODE') env[k] = v;
  }
  return env;
}

test('a self-signed origin is refused until the user continues; Go back keeps it refused', async () => {
  test.setTimeout(150_000);

  const certDir = mkdtempSync(join(tmpdir(), 'tepegoz-cert-'));
  execFileSync(
    'openssl',
    [
      ...['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1'],
      ...['-keyout', join(certDir, 'key.pem'), '-out', join(certDir, 'cert.pem')],
      ...['-subj', '/CN=127.0.0.1', '-addext', 'subjectAltName=IP:127.0.0.1'],
    ],
    { stdio: 'ignore' },
  );
  const hits: string[] = [];
  const server: Server = createServer(
    { key: readFileSync(join(certDir, 'key.pem')), cert: readFileSync(join(certDir, 'cert.pem')) },
    (req, res) => {
      hits.push(req.url ?? '');
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end('<!doctype html><title>BehindBadCert</title>hello');
    },
  );
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  const url = `https://127.0.0.1:${String((server.address() as AddressInfo).port)}/`;

  const profileDir = join(process.cwd(), '.certificate-error-profile');
  rmSync(profileDir, { recursive: true, force: true });
  mkdirSync(profileDir, { recursive: true });
  writeFileSync(join(profileDir, 'preferences.json'), '{}');

  const app = await electron.launch({
    args: [`--user-data-dir=${profileDir}`, appDir],
    env: guiEnv(),
  });
  try {
    const page = await app.firstWindow();
    const box = page.getByRole('combobox').first();
    await expect(box).toBeVisible();
    await box.fill(url);
    await box.press('Enter');

    const goBack = page.getByRole('button', { name: /Go back/ });
    const proceed = page.getByRole('button', { name: 'Continue anyway' });
    await expect(proceed).toBeVisible({ timeout: 30_000 });
    await new Promise((r) => setTimeout(r, 1500));
    expect(hits).toEqual([]);

    // Going back leaves it refused: still nothing reached the origin, and no tab shows its page.
    await goBack.click();
    await new Promise((r) => setTimeout(r, 1500));
    expect(hits).toEqual([]);
    await expect(page.getByRole('tab', { name: /BehindBadCert/ })).toHaveCount(0);

    // Control: ask again and continue — now the page loads, so the refusal above was the warning's doing.
    await box.fill(url);
    await box.press('Enter');
    await expect(proceed).toBeVisible({ timeout: 30_000 });
    await proceed.click();
    await expect(page.getByRole('tab', { name: /BehindBadCert/ })).toHaveCount(1, {
      timeout: 30_000,
    });
    expect(hits).toContain('/');
  } finally {
    await app.close().catch(() => undefined);
    await new Promise<void>((r) => server.close(() => r()));
    for (const dir of [profileDir, certDir]) {
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        /* the next run clears it */
      }
    }
  }
});
