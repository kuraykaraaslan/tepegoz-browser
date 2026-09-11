import { describe, expect, it } from 'vitest';
import { IrcAdapter, type ChatAccountCreds, type ChatSession } from '@tepegoz/chat-adapters';
import { NodeChatTransport } from './node-transport';

/**
 * A real integration check against a **live** ircd — not a fixture. Skipped unless
 * `TEPEGOZ_LIVE_IRC=1`, because it needs an actual server listening at `127.0.0.1:6667` and would
 * otherwise break every contributor's `pnpm test` / CI run. This is the X-chat.4 Functional DoD
 * ("connect to a local IRC server, join a channel, send/receive, backfill via chathistory,
 * reconnect") exercised against the real wire instead of a scripted fake.
 *
 * How to run it locally:
 *   1. Download an `ergo` release (https://github.com/ergochat/ergo/releases) — a single static
 *      binary, no install needed.
 *   2. `./ergo mkcerts && ./ergo run --conf default.yaml` (the shipped default already listens on
 *      `127.0.0.1:6667` plaintext, loopback-only, with chathistory + SASL registration enabled).
 *   3. `TEPEGOZ_LIVE_IRC=1 pnpm --filter @tepegoz/chat-transport-node test -- --run irc-live-ergo`
 *
 * This is how the `IRC_WANTED_CAPS` bug (chathistory was never requested from a real server — see
 * `packages/chat-adapters/src/irc/registration.ts`) was actually found: every unit test's fake
 * server ACKs whatever the test script scripts it to, independent of what the client asked for.
 */
describe.skipIf(process.env.TEPEGOZ_LIVE_IRC !== '1')('IrcAdapter — live ergo', () => {
  const host = process.env.TEPEGOZ_LIVE_IRC_HOST ?? '127.0.0.1';
  const port = Number(process.env.TEPEGOZ_LIVE_IRC_PORT ?? 6667);
  const channel = `#x-chat-4-${String(Date.now())}`;

  function creds(nick: string): ChatAccountCreds {
    return {
      accountId: nick,
      secret: '',
      server: { protocol: 'irc', server: host, port, tls: false, nick, sasl: false },
    };
  }

  async function connect(nick: string): Promise<{ adapter: IrcAdapter; session: ChatSession }> {
    const adapter = new IrcAdapter();
    const session = await adapter.connect(creds(nick), new NodeChatTransport());
    return { adapter, session };
  }

  /** The live stream also carries JOIN/PART room-membership events (ours and the peer's) ahead of
   *  the message we actually care about — skip those instead of asserting on the very first event. */
  async function nextMessageEvent(
    adapter: IrcAdapter,
    session: ChatSession,
    timeoutMs = 5000,
  ): Promise<unknown> {
    const it = adapter.events(session)[Symbol.asyncIterator]();
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) throw new Error(`timed out after ${String(timeoutMs)}ms waiting for a message event`);
      const timeout = new Promise<never>((_resolve, reject) => {
        setTimeout(() => reject(new Error('per-event timeout')), remaining);
      });
      const result: IteratorResult<unknown> = await Promise.race([it.next(), timeout]);
      const value: unknown = result.value;
      if (typeof value === 'object' && value !== null && (value as { type?: unknown }).type === 'message') {
        return value;
      }
    }
  }

  it('connects, joins, sends/receives, and backfills via chathistory', async () => {
    const alice = await connect(`alice${String(Date.now())}`);
    const bob = await connect(`bob${String(Date.now())}`);

    await alice.adapter.joinRoom(alice.session, channel);
    await bob.adapter.joinRoom(bob.session, channel);

    // Let both JOINs land before sending, so the message isn't racing bob's own join.
    await new Promise((r) => setTimeout(r, 500));

    await alice.adapter.sendMessage(alice.session, channel, {
      body: 'hello from a live test',
      replyToId: null,
      mediaPath: null,
    });

    const received = await nextMessageEvent(bob.adapter, bob.session);
    expect(received).toMatchObject({ type: 'message', message: { body: 'hello from a live test' } });

    // Reconnect + auto-rejoin: drop alice's connection (simulating a network blip) while bob stays
    // joined — an unregistered channel on a real ircd is destroyed, history and all, the moment it
    // empties out, so bob has to stay put for this to actually test reconnection rather than
    // accidentally testing "does a brand new ephemeral channel have history" (it never does).
    await alice.adapter.disconnect(alice.session);
    const aliceAgain = await connect(alice.session.accountId);
    await aliceAgain.adapter.joinRoom(aliceAgain.session, channel);

    // Confirm chathistory backfill actually returns what was sent before the reconnect — this is
    // the assertion the CAP-negotiation bug would have failed: without 'chathistory' /
    // 'draft/chathistory' in IRC_WANTED_CAPS, the ACKed-caps set never contains it and `history()`
    // silently returns nothing forever, live server or not.
    const page = await aliceAgain.adapter.history(aliceAgain.session, channel, null);
    expect(page.messages.some((m) => m.body === 'hello from a live test')).toBe(true);

    await aliceAgain.adapter.disconnect(aliceAgain.session);
    await bob.adapter.disconnect(bob.session);
  }, 20_000);
});
