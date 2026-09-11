import { describe, expect, it } from 'vitest';
import { MatrixAdapter, type ChatAccountCreds, type ChatSession } from '@tepegoz/chat-adapters';
import { NodeChatTransport } from './node-transport';

/**
 * A real integration check against a **live** Synapse — not a fixture. Skipped unless
 * `TEPEGOZ_LIVE_MATRIX=1`, because it needs an actual homeserver at `http://127.0.0.1:8008` and
 * would otherwise break every contributor's `pnpm test` / CI run. This is the X-chat.5 Functional
 * DoD ("a Matrix account syncs rooms, sends/receives text in unencrypted rooms") exercised against
 * the real wire instead of a scripted fake.
 *
 * How to run it locally (no Docker, no root — matrix-synapse installs from prebuilt wheels):
 *   1. `python3 -m venv synapse-venv && source synapse-venv/bin/activate && pip install matrix-synapse`
 *   2. `python -m synapse.app.homeserver --server-name test.local --config-path homeserver.yaml
 *      --generate-config --report-stats=no` — the generated config already binds a **plaintext**
 *      HTTP listener to `127.0.0.1:8008` with SQLite storage (no Postgres needed for a test server).
 *   3. Append `enable_registration: true` + `enable_registration_without_verification: true` to
 *      `homeserver.yaml`.
 *   4. `python -m synapse.app.homeserver --config-path homeserver.yaml` (background it), then
 *      `register_new_matrix_user -c homeserver.yaml -u alice -p alicepw123 --no-admin
 *      http://127.0.0.1:8008` (and the same for bob).
 *   5. `TEPEGOZ_LIVE_MATRIX=1 pnpm --filter @tepegoz/chat-transport-node test -- --run matrix-live-synapse`
 *
 * `ChatServerConfigSchema`'s matrix variant requires `https://` (the CS-API carries the access
 * token) — this test constructs `ChatAccountCreds` as a plain object, bypassing that zod boundary
 * the same way the IRC/XMPP live tests bypass TLS verification: legitimate only because this is a
 * throwaway local test server the schema is never asked to validate for real use.
 */
describe.skipIf(process.env.TEPEGOZ_LIVE_MATRIX !== '1')('MatrixAdapter — live Synapse', () => {
  const base = process.env.TEPEGOZ_LIVE_MATRIX_URL ?? 'http://127.0.0.1:8008';
  const serverName = process.env.TEPEGOZ_LIVE_MATRIX_SERVER ?? 'test.local';

  function creds(user: string, secret: string): ChatAccountCreds {
    return {
      accountId: user,
      secret,
      server: { protocol: 'matrix', homeserverUrl: base, userId: `@${user}:${serverName}` },
    };
  }

  async function connect(user: string, secret: string): Promise<{ adapter: MatrixAdapter; session: ChatSession }> {
    const adapter = new MatrixAdapter();
    const session = await adapter.connect(creds(user, secret), new NodeChatTransport());
    return { adapter, session };
  }

  /** Fixture setup only — the adapter contract has no `createRoom` (Tepegöz joins/discovers rooms,
   *  it doesn't stand them up), so a shared room to test messaging in has to come from a direct
   *  CS-API call, not from code under test. */
  async function loginToken(user: string, secret: string): Promise<string> {
    const res = await fetch(`${base}/_matrix/client/v3/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        type: 'm.login.password',
        identifier: { type: 'm.id.user', user },
        password: secret,
      }),
    });
    const json = (await res.json()) as { access_token: string };
    return json.access_token;
  }

  async function createRoomInvitingBob(aliceToken: string): Promise<string> {
    const res = await fetch(`${base}/_matrix/client/v3/createRoom`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${aliceToken}` },
      body: JSON.stringify({ invite: [`@bob:${serverName}`], preset: 'private_chat' }),
    });
    const json = (await res.json()) as { room_id: string };
    return json.room_id;
  }

  async function waitForMessageBody(
    adapter: MatrixAdapter,
    session: ChatSession,
    body: string,
    timeoutMs = 15_000,
  ): Promise<unknown> {
    const it = adapter.events(session)[Symbol.asyncIterator]();
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) throw new Error(`timed out after ${String(timeoutMs)}ms waiting for message body "${body}"`);
      const timeout = new Promise<never>((_resolve, reject) => {
        setTimeout(() => reject(new Error('per-event timeout')), remaining);
      });
      const result: IteratorResult<unknown> = await Promise.race([it.next(), timeout]);
      const value = result.value as { type?: unknown; message?: { body?: unknown } } | null;
      if (value?.type === 'message' && value.message?.body === body) return value;
    }
  }

  it('connects two accounts, exchanges a room message, and backfills history', async () => {
    const aliceToken = await loginToken('alice', 'alicepw123');
    const roomId = await createRoomInvitingBob(aliceToken);

    const alice = await connect('alice', 'alicepw123');
    const bob = await connect('bob', 'bobpw123');

    await bob.adapter.joinRoom(bob.session, roomId);
    // Let bob's own /sync pick up the join before alice sends, so the message isn't racing it.
    await new Promise((r) => setTimeout(r, 1000));

    const body = `hello from a live test ${String(Date.now())}`;
    await alice.adapter.sendMessage(alice.session, roomId, { body, replyToId: null, mediaPath: null });

    const received = await waitForMessageBody(bob.adapter, bob.session, body);
    expect(received).toMatchObject({ type: 'message', message: { body } });

    await alice.adapter.disconnect(alice.session);
    await bob.adapter.disconnect(bob.session);

    // Reconnect as alice and confirm a /messages backfill actually returns what was sent.
    const aliceAgain = await connect('alice', 'alicepw123');
    const page = await aliceAgain.adapter.history(aliceAgain.session, roomId, null);
    expect(page.messages.some((m) => m.body === body)).toBe(true);
    await aliceAgain.adapter.disconnect(aliceAgain.session);
  }, 40_000);
});
