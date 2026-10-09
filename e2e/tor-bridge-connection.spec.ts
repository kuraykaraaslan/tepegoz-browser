import { resolve, join } from 'node:path';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { test, expect, _electron as electron, type ElectronApplication } from '@playwright/test';

/**
 * Tor bridge lines through the real IPC boundary, end to end.
 *
 * `bridge-line.ts`, the `AddNetworkConnectionSchema` and the `networkAddConnection` handler are each
 * unit-tested. What only a real launch shows is the whole boundary behaving as one: the renderer's
 * payload is zod-parsed in main, a pasted line is normalized to its canonical form BEFORE it is stored,
 * the stored row survives into the preferences the renderer reads back, and a malformed line is refused
 * without leaving a half-added connection behind.
 *
 * It deliberately stops at storage. Adding a Tor connection dials nothing (a connection comes up only
 * when something binds to it), so no `tor` binary is needed — and none is claimed to work here.
 */

const appDir = resolve(process.cwd(), 'apps/desktop');

function guiEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined && k !== 'ELECTRON_RUN_AS_NODE') env[k] = v;
  }
  return env;
}

interface TorConnection {
  kind: string;
  label: string;
  bridges?: string[];
}
interface Bridge {
  addNetworkConnection(input: {
    kind: 'tor';
    label: string;
    note: string;
    upstreamConnectionId: string | null;
    bridges?: string[];
  }): Promise<void>;
  getPreferences(): Promise<{ networkConnections: TorConnection[] }>;
}

test('a pasted bridge line is stored in canonical form, and a malformed one is refused whole', async () => {
  test.setTimeout(150_000);

  const profileDir = join(process.cwd(), '.tor-bridge-profile');
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

    const connections = (): Promise<TorConnection[]> =>
      page.evaluate(async () => {
        const prefs = await (window as unknown as { tepegoz: Bridge }).tepegoz.getPreferences();
        return prefs.networkConnections;
      });
    expect(await connections()).toEqual([]);

    // ── A line as it arrives from a web page: torrc prefix, no-break space, smart quotes ──
    const pasted = 'Bridge “192.0.2.1:9001”';
    await page.evaluate(async (line: string) => {
      await (window as unknown as { tepegoz: Bridge }).tepegoz.addNetworkConnection({
        kind: 'tor',
        label: 'Bridged',
        note: '',
        upstreamConnectionId: null,
        bridges: [line],
      });
    }, pasted);
    const stored = await connections();
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ kind: 'tor', label: 'Bridged', bridges: ['192.0.2.1:9001'] });

    // ── A malformed line is refused, and nothing is half-added ──
    const refused = await page.evaluate(async () => {
      try {
        await (window as unknown as { tepegoz: Bridge }).tepegoz.addNetworkConnection({
          kind: 'tor',
          label: 'Broken',
          note: '',
          upstreamConnectionId: null,
          bridges: ['this is not a bridge'],
        });
        return null;
      } catch (err) {
        return String(err);
      }
    });
    expect(refused).not.toBeNull();
    const after = await connections();
    expect(after.map((c) => c.label)).toEqual(['Bridged']);

    // ── More than the cap is refused at the schema, before the handler even looks at it ──
    const tooMany = await page.evaluate(async () => {
      try {
        await (window as unknown as { tepegoz: Bridge }).tepegoz.addNetworkConnection({
          kind: 'tor',
          label: 'Many',
          note: '',
          upstreamConnectionId: null,
          bridges: Array.from({ length: 17 }, () => '192.0.2.1:9001'),
        });
        return null;
      } catch (err) {
        return String(err);
      }
    });
    expect(tooMany).not.toBeNull();
    expect((await connections()).map((c) => c.label)).toEqual(['Bridged']);
  } finally {
    await app.close().catch(() => undefined);
    try {
      rmSync(profileDir, { recursive: true, force: true });
    } catch {
      /* the next run clears it */
    }
  }
});
