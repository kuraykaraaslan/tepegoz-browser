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
 * **Found a real reconnect-loop bug (2026-09-12), now fixed — the history below is why this test
 * exists at all, not a live issue.** The account used to reach `reconnecting`, never `online`:
 * `homeserver.log` showed a fresh `POST /_matrix/client/v3/login` roughly every ~1s, each one
 * succeeding server-side (`200`), i.e. a genuine reconnect-from-scratch loop. Root-caused with
 * temporary `console.error` instrumentation in the launched app's main process (piped via
 * `app.process().stdout`/`.stderr` — removed again once diagnosed): every event-processing error
 * thrown inside `ChatConnectionManager.pump()`'s `for await` loop (main-process runtime, not the
 * adapter-level fake-transport tests) is swallowed and treated as "the connection dropped," forcing
 * a full reconnect. The actual thrown error was `FOREIGN KEY constraint failed` from
 * `ChatStore.upsertMessage` — TWO compounding gaps, both fixed:
 *   1. `MatrixAdapter.syncOnce()` pushed a sync batch's `message` events before that batch's
 *      `room-membership` events, so a room's very first message could arrive before its
 *      conversation row existed even when everything else was right.
 *   2. The deeper gap: `ChatAccountRunner.applyChange`'s `'room'` case only ever UPDATED an
 *      existing conversation row, never created one — fine for a room joined interactively (which
 *      persists its row directly via `joinRoom()`), but Matrix reports every room the account is
 *      ALREADY a member of on its very first `/sync`, with no `joinRoom()` call in between. Any
 *      account with pre-existing Matrix room history (which is every real Matrix account) could
 *      never get past its own initial sync.
 * Neither surfaced in `matrix-live-synapse.manual.test.ts` (same `MatrixAdapter`, same Synapse) —
 * that test's fake in-memory store has no foreign key to violate; only the real SQLite-backed
 * desktop app does.
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

test('adds a live Matrix account, joins a room, sends a message, and reacts to it', async ({}, testInfo) => {
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

    // React to our own message (m.reaction) — the same UI path XMPP's XEP-0444 test exercises.
    await window.waitForTimeout(1000);
    await window.getByRole('button', { name: 'Add reaction' }).click();
    await window.getByRole('menuitem', { name: '👍' }).click();
    await expect(window.getByRole('button', { name: '👍 1' })).toBeVisible({ timeout: 10_000 });
  } finally {
    await app.close();
  }
});
