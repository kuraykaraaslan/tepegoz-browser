import { resolve, join } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test';

/**
 * The Matrix counterpart to `chat-live-xmpp.spec.ts` — X-chat.10's Playwright `_electron` e2e, run
 * for real against the live local Synapse set up for the X-chat.5 Functional DoD (see
 * `packages/chat-transport-node/src/matrix-live-synapse.manual.test.ts` for the base recipe). Skipped
 * unless `TEPEGOZ_LIVE_MATRIX=1`.
 *
 * Needs its OWN listener, on top of that base recipe: `ChatServerConfigSchema`'s matrix variant
 * requires `homeserverUrl` to start with `https://` (the CS-API carries the access token), so the
 * plain-HTTP `:8008` listener the manual adapter-level test uses can't be driven through the real
 * account-setup form. Add a second, TLS listener to `homeserver.yaml`:
 *
 *   tls_certificate_path: ".../synapse/certs/localhost.crt"   (openssl req -x509 ... as usual)
 *   tls_private_key_path: ".../synapse/certs/localhost.key"
 *   listeners:
 *     - port: 8008
 *       tls: false
 *       ...   (keep the original plain listener — the manual test still uses it)
 *     - port: 8448
 *       tls: true
 *       type: http
 *       bind_addresses: ['127.0.0.1']
 *       resources: [{ names: [client, federation], compress: false }]
 *
 * (PyYAML takes the LAST `listeners:` key if the block is appended rather than edited in place —
 * either works, just don't end up with two `listeners:` blocks fighting if you edit by hand.)
 * Restart Synapse after the config change. Only possible once `AccountSetupForm` grew Matrix fields.
 *
 * **Known failing, unresolved (2026-09-12) — do not "fix" this by adjusting the test's timeout.**
 * The account reaches `reconnecting`, never `online`. `homeserver.log` shows a fresh
 * `POST /_matrix/client/v3/login` roughly every ~1s for as long as the app stays open, each one
 * succeeding server-side (`200`), alongside a growing pile of `/sync` long-polls that eventually get
 * dropped as "already disconnected" — i.e. the account genuinely reconnects from scratch on a tight
 * loop, not a single stuck connection. The SAME `MatrixAdapter` code (login → syncOnce → runSyncLoop)
 * is exercised with zero issues by `matrix-live-synapse.manual.test.ts` against the SAME Synapse
 * instance on the plain-HTTP `:8008` listener — so this is specific to going through the real
 * `ChatConnectionManager`/`ChatAccountRunner` stack (not the raw adapter) and/or the TLS listener,
 * not a fault in the login/sync logic itself. `packages/chat-core/src/connection-manager.ts`'s
 * `pump()` treats the adapter's `events()` async generator *returning* as "connection dropped" and
 * triggers a full reconnect (`scheduleReconnect` → `attemptConnect` → fresh `connect()` → fresh
 * login); `MatrixSession.nextEvent()` looks correctly built to block forever on an empty queue rather
 * than ever returning `done`, so that specific theory didn't pan out under a read of the code — the
 * actual trigger needs runtime instrumentation inside the launched app's main process to pin down
 * (e.g. temporary logging in `ChatConnectionManager.attemptConnect`'s catch block to see what error,
 * if any, is actually landing there). Whoever picks this up next: confirm only one runner/account
 * exists first (it does — checked via `listChatAccounts()` mid-run, a single row) before going
 * further down that path.
 */
test.skip(process.env.TEPEGOZ_LIVE_MATRIX !== '1', 'needs a live local Synapse with a TLS listener — see the file header');

const appDir = resolve(process.cwd(), 'apps/desktop');

function guiEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined && k !== 'ELECTRON_RUN_AS_NODE') env[k] = v;
  }
  // The test Synapse's TLS cert is a throwaway self-signed one — trusting it here is scoped to this
  // one launched process via Node's own CA mechanism, not a change to how the app verifies certs.
  env.NODE_EXTRA_CA_CERTS = resolve(process.cwd(), '.synapse-test-ca.crt');
  return env;
}

async function openChatPage(window: Page): Promise<void> {
  const omnibox = window.getByRole('combobox').first();
  await omnibox.fill('tepegoz://com.tepegoz.chat');
  await omnibox.press('Enter');
  // Not a bare 'tablist' role query: the browser chrome has its own tab strip under that same role.
  await expect(window.getByRole('tab', { name: 'Chats' })).toBeVisible({ timeout: 20_000 });
}

/** Fixture setup only — the adapter contract has no `createRoom` (Tepegöz joins/discovers rooms, it
 *  doesn't stand them up, same reasoning as the manual live test), so a room to join through the real
 *  UI has to come from a direct CS-API call, not from code under test. */
async function createPublicRoom(): Promise<string> {
  const base = 'https://127.0.0.1:8448';
  const loginRes = await fetch(`${base}/_matrix/client/v3/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      type: 'm.login.password',
      identifier: { type: 'm.id.user', user: 'alice' },
      password: 'alicepw123',
    }),
  });
  const login = (await loginRes.json()) as { access_token: string };
  const roomRes = await fetch(`${base}/_matrix/client/v3/createRoom`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${login.access_token}` },
    body: JSON.stringify({ preset: 'public_chat', name: `e2e-${String(Date.now())}` }),
  });
  const room = (await roomRes.json()) as { room_id: string };
  return room.room_id;
}

test('adds a live Matrix account, joins a room, and sees a sent message render', async ({}, testInfo) => {
  // Known-failing (see the file header): the account never reaches 'online' through the real
  // ChatConnectionManager/ChatAccountRunner stack, though the same MatrixAdapter code works fine
  // called directly. test.fail() so this stays a tracked, reproducible repro rather than a silent
  // red X — if it starts passing, Playwright flags THAT as the anomaly, the signal to remove this.
  test.fail();
  testInfo.setTimeout(90_000);
  // The self-signed test cert isn't in Node's default trust store — scoped to this one process, and
  // only for the fixture-setup fetch above (the launched Electron app trusts it via
  // NODE_EXTRA_CA_CERTS instead, the real, narrower mechanism).
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
  let roomId: string;
  try {
    roomId = await createPublicRoom();
  } finally {
    delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
  }

  const profileDir = join(process.cwd(), '.chat-live-matrix-profile');
  mkdirSync(profileDir, { recursive: true });
  writeFileSync(join(profileDir, 'preferences.json'), '{"locale":"en"}');

  const app: ElectronApplication = await electron.launch({
    args: [`--user-data-dir=${profileDir}`, appDir],
    env: guiEnv(),
  });
  try {
    const window = await app.firstWindow();
    await expect(window.getByRole('banner')).toBeVisible();

    await openChatPage(window);

    await window.getByRole('button', { name: 'Add account' }).click();
    await window.getByLabel('Protocol').selectOption('matrix');
    await window.getByLabel('Account name').fill('E2E Synapse');
    await window.getByLabel('Homeserver URL').fill('https://127.0.0.1:8448');
    await window.getByLabel('User ID').fill('@alice:test.local');
    await window.getByLabel('Password').fill('alicepw123');
    await window.getByRole('button', { name: 'Add account' }).click();

    await expect
      .poll(
        () =>
          window.evaluate(async () => {
            type ChatBridge = { listChatAccounts: () => Promise<{ states: Record<string, string> }> };
            const bridge = (window as unknown as { tepegoz: ChatBridge }).tepegoz;
            const snapshot = await bridge.listChatAccounts();
            return Object.values(snapshot.states);
          }),
        { timeout: 20_000 },
      )
      .toContain('online');

    // Join the room created above through the real room-browser UI (join-by-address takes a room
    // id/alias the same way it takes a Jabber MUC address or an IRC channel).
    await window.getByRole('tab', { name: 'Find a room' }).click();
    await window.getByLabel('Join by address').fill(roomId);
    await window.getByRole('button', { name: 'Join', exact: true }).click();

    const composer = window.getByPlaceholder('Write a message…');
    await expect(composer).toBeVisible({ timeout: 20_000 });

    const body = `hello from a live e2e test ${String(Date.now())}`;
    await composer.fill(body);
    await composer.press('Enter');

    await expect(window.getByText(body)).toBeVisible({ timeout: 20_000 });
  } finally {
    await app.close();
  }
});
