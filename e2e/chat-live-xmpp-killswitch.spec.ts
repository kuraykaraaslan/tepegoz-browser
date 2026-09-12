import { resolve, join } from 'node:path';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test';

/**
 * X-chat.1's other live-server Functional DoD line ("Kill-switched profile: accounts show
 * 'blocked', no socket opens"), run for real against the same local Prosody as
 * `chat-live-xmpp.spec.ts`. Skipped unless `TEPEGOZ_LIVE_XMPP=1` — see that file's header for how
 * to stand the server up.
 *
 * Reuses the Phase 5 network-binding kill-switch proven in `spike-tunnel-binding.spec.ts`: a
 * General binding pointing at a connection with no usable SOCKS port makes
 * `apps/desktop/src/main/network/binding-service.electron.ts`'s `installAppEgressRoute` policy
 * resolve to `{ mode: 'tunnel', socksPort: 0 }`, which `chatMayEgress()`
 * (`apps/desktop/src/main/chat/chat-service.electron.ts`) reads as "may not egress" — and
 * `ChatConnectionManager.attemptConnect` (`packages/chat-core/src/connection-manager.ts`) checks
 * that BEFORE ever calling `adapter.connect()`, so the account goes straight to `blocked` with no
 * socket dialed at all.
 *
 * Unlike that spike, this test never needs a working proxy: the connection points at a port
 * nothing listens on, so it never reaches `up` in the first place — no need to bring a tunnel up
 * and then kill it, just to prove a *never-up* one blocks correctly.
 */
test.skip(process.env.TEPEGOZ_LIVE_XMPP !== '1', 'needs a live local Prosody — see chat-live-xmpp.spec.ts');

const appDir = resolve(process.cwd(), 'apps/desktop');

function guiEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined && k !== 'ELECTRON_RUN_AS_NODE') env[k] = v;
  }
  const testCa = resolve(process.cwd(), '.prosody-test-ca.crt');
  env.NODE_EXTRA_CA_CERTS = testCa;
  return env;
}

/** A local TCP port guaranteed to have nothing listening on it: bind, read the assigned port,
 *  close immediately. Far more reliable than picking a fixed high port and hoping. */
async function deadPort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  const port = (server.address() as { port: number }).port;
  await new Promise<void>((r) => server.close(() => r()));
  return port;
}

interface NetworkBridge {
  addNetworkConnection(input: {
    kind: 'byo-socks';
    label: string;
    note: string;
    socksPort: number;
  }): Promise<void>;
  setGeneralNetworkBinding(
    binding: { kind: 'direct' } | { kind: 'connection'; connectionId: string },
  ): Promise<void>;
  getNetworkState(): Promise<{
    connections: { id: string; label: string; status: string }[];
  }>;
}

interface ChatBridge {
  listChatAccounts: () => Promise<{ states: Record<string, string> }>;
}

async function openChatPage(window: Page): Promise<void> {
  const omnibox = window.getByRole('combobox').first();
  await omnibox.fill('tepegoz://com.tepegoz.chat');
  await omnibox.press('Enter');
  await expect(window.getByRole('tab', { name: 'Chats' })).toBeVisible({ timeout: 20_000 });
}

test('a kill-switched profile blocks a chat account before it ever dials out', async ({}, testInfo) => {
  testInfo.setTimeout(90_000);
  const profileDir = join(process.cwd(), '.chat-live-xmpp-killswitch-profile');
  mkdirSync(profileDir, { recursive: true });
  writeFileSync(join(profileDir, 'preferences.json'), '{"locale":"en"}');

  const app: ElectronApplication = await electron.launch({
    args: [`--user-data-dir=${profileDir}`, appDir],
    env: guiEnv(),
  });
  try {
    const window = await app.firstWindow();
    await expect(window.getByRole('banner')).toBeVisible();

    // ── 1. Arm the kill switch BEFORE any chat account exists — a connection with nothing
    // listening on its port never reaches "up", so the General binding can never be honoured. ──
    const port = await deadPort();
    await window.evaluate(async (p: number) => {
      const net = (window as unknown as { tepegoz: NetworkBridge }).tepegoz;
      await net.addNetworkConnection({ kind: 'byo-socks', label: 'Dead', note: 'e2e', socksPort: p });
    }, port);

    const connectionId = await window.evaluate(async () => {
      const net = (window as unknown as { tepegoz: NetworkBridge }).tepegoz;
      const state = await net.getNetworkState();
      return state.connections[0]?.id ?? null;
    });
    expect(connectionId).not.toBeNull();

    await window.evaluate(async (id: string) => {
      const net = (window as unknown as { tepegoz: NetworkBridge }).tepegoz;
      await net.setGeneralNetworkBinding({ kind: 'connection', connectionId: id });
    }, connectionId as string);

    await expect
      .poll(
        () =>
          window.evaluate(async () => {
            const net = (window as unknown as { tepegoz: NetworkBridge }).tepegoz;
            const state = await net.getNetworkState();
            return state.connections[0]?.status ?? 'unknown';
          }),
        { timeout: 20_000 },
      )
      .toBe('down');

    // ── 2. NOW add the XMPP account, through the real form, same as chat-live-xmpp.spec.ts ──
    await openChatPage(window);
    await window.getByRole('button', { name: 'Add account' }).click();
    await window.getByLabel('Account name').fill('E2E Alice Blocked');
    await window.getByLabel('Jabber ID (JID)').fill('alice@localhost');
    await window.getByLabel('Password').fill('alicepw123');
    await window.getByRole('button', { name: 'Connection settings' }).click();
    await window.getByLabel('Server host').fill('127.0.0.1');
    await window.getByLabel('Port').fill('5222');
    await window.getByLabel('Security').selectOption('starttls');
    await window.getByRole('button', { name: 'Add account' }).click();

    // ── 3. It must go straight to "blocked" — never "connecting", never "online" ──
    const statesOf = (): Promise<string[]> =>
      window.evaluate(async () => {
        const chat = (window as unknown as { tepegoz: ChatBridge }).tepegoz;
        const snapshot = await chat.listChatAccounts();
        return Object.values(snapshot.states);
      });

    await expect.poll(statesOf, { timeout: 15_000 }).toContain('blocked');

    // Give a real dial attempt every chance to have started if the gate were missing — the manual
    // TCP connect to the (nonexistent) live Prosody would otherwise resolve/reject well inside
    // this window and flip the state away from "blocked".
    await window.waitForTimeout(3_000);
    expect(await statesOf()).toContain('blocked');
    expect(await statesOf()).not.toContain('online');

    // ── 4. Lifting the kill switch must let the SAME account connect for real ──
    await window.evaluate(async () => {
      const net = (window as unknown as { tepegoz: NetworkBridge }).tepegoz;
      await net.setGeneralNetworkBinding({ kind: 'direct' });
    });
    await expect.poll(statesOf, { timeout: 20_000 }).toContain('online');
  } finally {
    await app.close();
    rmSync(profileDir, { recursive: true, force: true });
  }
});
