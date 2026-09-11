import { connect as tlsConnect, type TLSSocket } from 'node:tls';
import { describe, expect, it } from 'vitest';
import { XmppAdapter, type ChatAccountCreds, type ChatSession } from '@tepegoz/chat-adapters';
import { NodeChatTransport, type RawDuplex } from './node-transport';

/**
 * A real integration check against a **live** Prosody — not a fixture. Skipped unless
 * `TEPEGOZ_LIVE_XMPP=1`, because it needs an actual server listening at `127.0.0.1:5222` and would
 * otherwise break every contributor's `pnpm test` / CI run. This is the X-chat.1 Functional DoD
 * ("two XMPP accounts connect, exchange 1:1 messages, backfill history via MAM") exercised against
 * the real wire instead of a scripted fake.
 *
 * How to run it locally (no Docker, no root/apt needed — a user-space Prosody install):
 *   1. `apt-get download` (works unprivileged) prosody + its Lua deps (lua5.4, lua-sec, lua-socket,
 *      lua-filesystem, lua-expat, lua-event, lua-bitop, libevent-2.1-7t64) and `dpkg -x` each into a
 *      prefix directory — dpkg -x only extracts, it never touches system paths or needs root.
 *   2. Patch the `CFG_SOURCEDIR` / `CFG_CONFIGDIR` / `CFG_PLUGINDIR` / `CFG_DATADIR` constants at the
 *      top of the extracted `usr/bin/prosody` (and `prosodyctl`) to point into that prefix.
 *   3. Write a `prosody.cfg.lua` into the prefix's `etc/prosody/` with `data_path` / `pidfile` / `log`
 *      under the prefix (never `/var/lib`, `/run`, `/var/log`), `c2s_ports = {5222}`,
 *      `c2s_require_encryption = false`, `mam` + `smacks` in `modules_enabled`, and a self-signed
 *      cert (`openssl req -x509 -newkey rsa:2048 -nodes ...`) named `<host>.crt`/`.key` under
 *      `certificates`.
 *   4. `PATH=<prefix>/usr/bin:$PATH LUA_PATH=... LUA_CPATH=... LD_LIBRARY_PATH=... prosody`,
 *      then `prosodyctl adduser alice@localhost` / `bob@localhost`.
 *   5. `TEPEGOZ_LIVE_XMPP=1 pnpm --filter @tepegoz/chat-transport-node test -- --run xmpp-live-prosody`
 *
 * The self-signed cert means this test's transport must skip TLS verification for the STARTTLS
 * upgrade — never do that outside a throwaway local test server.
 */
describe.skipIf(process.env.TEPEGOZ_LIVE_XMPP !== '1')('XmppAdapter — live Prosody', () => {
  const host = process.env.TEPEGOZ_LIVE_XMPP_HOST ?? 'localhost';
  const port = Number(process.env.TEPEGOZ_LIVE_XMPP_PORT ?? 5222);

  /** A self-signed test cert can't pass real verification — this transport is only ever pointed at
   *  the throwaway local Prosody above. */
  function insecureTransport(): NodeChatTransport {
    return new NodeChatTransport({
      secure: (raw, opts) =>
        new Promise<RawDuplex>((resolve, reject) => {
          const socket: TLSSocket = tlsConnect({
            socket: raw.nodeSocket,
            servername: opts.servername,
            rejectUnauthorized: false,
          });
          socket.once('secureConnect', () => {
            let closeCb: (err?: Error) => void = () => undefined;
            socket.on('error', (err: Error) => closeCb(err));
            socket.on('close', () => closeCb());
            resolve({
              write: (data) => {
                socket.write(data);
              },
              onData: (cb) => socket.on('data', (chunk: Buffer) => cb(new Uint8Array(chunk))),
              onClose: (cb) => {
                closeCb = cb;
              },
              destroy: () => socket.destroy(),
              ...(raw.nodeSocket !== undefined ? { nodeSocket: raw.nodeSocket } : {}),
            });
          });
          socket.once('error', reject);
        }),
    });
  }

  function creds(user: string, secret: string): ChatAccountCreds {
    return {
      accountId: user,
      secret,
      server: { protocol: 'xmpp', jid: `${user}@${host}`, host, port, security: 'starttls', wsUrl: null },
    };
  }

  async function connect(user: string, secret: string): Promise<{ adapter: XmppAdapter; session: ChatSession }> {
    const adapter = new XmppAdapter();
    const session = await adapter.connect(creds(user, secret), insecureTransport());
    return { adapter, session };
  }

  /** Skips anything that isn't the specific message we're waiting for — a fresh connection can
   *  surface an unrelated leftover from a previous local run (MAM catch-up on bind), so matching
   *  only on `type: 'message'` is not enough to isolate this test's own traffic. */
  async function waitForMessageBody(
    adapter: XmppAdapter,
    session: ChatSession,
    body: string,
    timeoutMs = 8000,
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

  it('connects two accounts, exchanges a 1:1 message, and backfills via MAM', async () => {
    const alice = await connect('alice', 'alicepw123');
    const bob = await connect('bob', 'bobpw123');

    expect(alice.session.caps.historySync).toBe(true);

    // A resource that has never broadcast presence isn't "available" from the server's routing
    // point of view — without this, Prosody has nothing to route a live message to and the send
    // below silently goes nowhere (no offline-storage module is enabled in this test server either).
    await alice.adapter.setPresence(alice.session, 'online');
    await bob.adapter.setPresence(bob.session, 'online');
    await new Promise((r) => setTimeout(r, 300));

    const body = `hello from a live test ${String(Date.now())}`;
    await alice.adapter.sendMessage(alice.session, 'bob@localhost', {
      body,
      replyToId: null,
      mediaPath: null,
    });

    const received = await waitForMessageBody(bob.adapter, bob.session, body);
    expect(received).toMatchObject({ type: 'message', message: { body } });

    await alice.adapter.disconnect(alice.session);
    await bob.adapter.disconnect(bob.session);

    // Reconnect as alice and confirm MAM backfill actually returns the message just sent.
    const aliceAgain = await connect('alice', 'alicepw123');
    const page = await aliceAgain.adapter.history(aliceAgain.session, 'bob@localhost', null);
    expect(page.messages.some((m) => m.body === body)).toBe(true);
    await aliceAgain.adapter.disconnect(aliceAgain.session);
  }, 30_000);
});
