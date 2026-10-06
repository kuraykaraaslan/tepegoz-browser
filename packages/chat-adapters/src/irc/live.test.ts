import { describe, expect, it, vi } from 'vitest';
import { IrcAdapter, IrcSession } from './adapter';
import { FakeServer, connected, creds, tick } from './test-harness';

describe('IrcAdapter — live traffic', () => {
  it('surfaces an inbound PRIVMSG as a raw ChatEvent', async () => {
    const { adapter, server, session } = await connected();
    const it = adapter.events(session)[Symbol.asyncIterator]();
    server.send(':bob!b@h PRIVMSG #chan :hello');
    expect((await it.next()).value).toMatchObject({
      type: 'message',
      message: { conversationId: '#chan', body: 'hello' },
    });
  });

  it('sendMessage / joinRoom / leaveRoom write the right lines and track channels', async () => {
    const { adapter, server, session } = await connected();
    await adapter.sendMessage(session, '#chan', { body: 'yo', replyToId: null, mediaPath: null });
    expect(server.lastWritten()).toBe('PRIVMSG #chan :yo');

    const conv = await adapter.joinRoom(session, '#Room');
    expect(conv).toMatchObject({ id: '#room', kind: 'room' });
    expect(server.lastWritten()).toBe('JOIN #Room');
    expect(session.joined.has('#room')).toBe(true);

    await adapter.leaveRoom(session, '#room');
    expect(server.lastWritten()).toBe('PART #room');
    expect(session.joined.has('#room')).toBe(false);
  });

  it('with echo-message, sendMessage resolves with the SAME protocolId the live echo event carries', async () => {
    // Regression: sendMessage used to fabricate its own id, never sent on the wire — the server's
    // own-echo (a real msgid, or the recorded-trace fixture's fallback) never matched it, so the
    // account-runner's optimistic-echo reconcile and the live echo landed as two different rows
    // (chat-store dedups by exact protocolId). Found live against a real ergo server.
    const server = new FakeServer();
    const adapter = new IrcAdapter();
    const p = adapter.connect(creds(), server);
    await tick();
    server.send('CAP * LS :message-tags server-time echo-message');
    server.send('CAP ada ACK :message-tags server-time echo-message');
    server.send(':irc.example 001 ada :Welcome ada');
    const session = (await p) as IrcSession;

    const it = adapter.events(session)[Symbol.asyncIterator]();
    const sendP = adapter.sendMessage(session, '#chan', {
      body: 'yo',
      replyToId: null,
      mediaPath: null,
    });
    await tick();
    expect(server.lastWritten()).toBe('PRIVMSG #chan :yo');

    // The server reflects our own PRIVMSG back, tagged with its real message id.
    server.send('@msgid=srv-echo-1 :ada!a@h PRIVMSG #chan :yo');

    const receipt = await sendP;
    expect(receipt.protocolId).toBe('srv-echo-1');
    const echoed = await it.next();
    expect(echoed.value).toMatchObject({
      type: 'message',
      message: { protocolId: 'srv-echo-1', body: 'yo' },
    });
  });

  it('with echo-message ACKed but no echo received, sendMessage still resolves (fallback id, not a hang)', async () => {
    vi.useFakeTimers();
    try {
      const server = new FakeServer();
      const adapter = new IrcAdapter();
      const p = adapter.connect(creds(), server);
      await vi.advanceTimersByTimeAsync(0);
      server.send('CAP * LS :echo-message');
      server.send('CAP ada ACK :echo-message');
      server.send(':irc.example 001 ada :Welcome ada');
      const session = (await p) as IrcSession;

      const receiptP = adapter.sendMessage(session, '#chan', {
        body: 'yo',
        replyToId: null,
        mediaPath: null,
      });
      await vi.advanceTimersByTimeAsync(5_000);
      const receipt = await receiptP;
      expect(receipt.protocolId).toMatch(/^\d+~ada~yo$/);
    } finally {
      vi.useRealTimers();
    }
  });

  it('a KICK surfaces as both a room-membership leave and a system message', async () => {
    const { adapter, server, session } = await connected();
    const it = adapter.events(session)[Symbol.asyncIterator]();
    server.send(':op!o@h KICK #chan bob :spam');
    expect((await it.next()).value).toMatchObject({
      type: 'room-membership',
      address: '#chan/bob',
      joined: false,
    });
    expect((await it.next()).value).toMatchObject({
      type: 'message',
      message: { conversationId: '#chan', kind: 'system', body: 'op kicked bob: spam' },
    });
  });

  it('tracks our own JOIN/PART for auto-rejoin', async () => {
    const { server, session } = await connected();
    server.send(':ada!a@h JOIN #a', ':ada!a@h JOIN #b', ':ada!a@h PART #a');
    expect([...session.joined]).toEqual(['#b']);
  });

  it('joinRoom and our own echoed JOIN fold to the same key under rfc1459', async () => {
    const { adapter, server, session } = await connected();
    await adapter.joinRoom(session, '#Test[1]');
    expect(session.joined.has('#test{1}')).toBe(true); // rfc1459: [ → {
    // the server echoes our JOIN; the membership tracker must not add a second, differently-folded key
    server.send(':ada!a@h JOIN #Test[1]');
    expect([...session.joined]).toEqual(['#test{1}']);
    await adapter.leaveRoom(session, '#Test[1]');
    expect(session.joined.size).toBe(0);
  });

  it('setPresence maps to AWAY, disconnect QUITs and ends the iterator', async () => {
    const { adapter, server, session } = await connected();
    await adapter.setPresence(session, 'dnd', 'in a meeting');
    expect(server.lastWritten()).toBe('AWAY :in a meeting');
    await adapter.setPresence(session, 'online');
    expect(server.lastWritten()).toBe('AWAY');

    const it = adapter.events(session)[Symbol.asyncIterator]();
    await adapter.disconnect(session);
    expect(server.written).toContain('QUIT :bye');
    expect((await it.next()).done).toBe(true);
  });

  it('roster / listConversations / markRead are inert', async () => {
    const { adapter, session } = await connected();
    expect(await adapter.roster()).toEqual([]);
    expect(await adapter.listConversations()).toEqual([]);
    await expect(adapter.markRead()).resolves.toBeUndefined();
    // history is a no-op without the chathistory cap
    expect(await adapter.history(session, '#c', null)).toEqual({ messages: [], nextCursor: null });
  });

  it('history() runs a CHATHISTORY BEFORE and resolves from the batch', async () => {
    const server = new FakeServer();
    const adapter = new IrcAdapter();
    const p = adapter.connect(creds(), server);
    await tick();
    server.send('CAP * LS :chathistory batch message-tags server-time');
    server.send('CAP ada ACK :chathistory batch message-tags server-time');
    server.send(':irc 001 ada :Welcome');
    const session = (await p) as IrcSession;

    const histP = adapter.history(session, '#chan', null);
    await tick();
    expect(server.lastWritten()).toBe('CHATHISTORY BEFORE #chan * 50');

    server.send(
      'BATCH +h1 chathistory #chan',
      '@batch=h1;time=2026-01-01T00:00:02.000Z :bob!b@h PRIVMSG #chan :second',
      '@batch=h1;time=2026-01-01T00:00:01.000Z :bob!b@h PRIVMSG #chan :first',
      'BATCH -h1',
    );
    const page = await histP;
    expect(page.messages.map((m) => m.body)).toEqual(['first', 'second']);
    expect(page.nextCursor).toBe('2026-01-01T00:00:01.000Z');
  });

  it('a non-chathistory batch falls through to the live stream', async () => {
    const { adapter, server, session } = await connected();
    const it = adapter.events(session)[Symbol.asyncIterator]();
    server.send(
      'BATCH +n netjoin',
      '@batch=n :bob!b@h PRIVMSG #c :inside a netjoin batch',
      'BATCH -n',
      ':bob!b@h PRIVMSG #c :after',
    );
    // the batched PRIVMSG is surfaced like any other line; then the plain one
    expect((await it.next()).value).toMatchObject({ message: { body: 'inside a netjoin batch' } });
    expect((await it.next()).value).toMatchObject({ message: { body: 'after' } });
  });

  it('ignores a BATCH close / tag for an unknown ref', async () => {
    const { adapter, server, session } = await connected();
    const it = adapter.events(session)[Symbol.asyncIterator]();
    server.send('BATCH -ghost', '@batch=ghost :bob!b@h PRIVMSG #c :orphan');
    expect((await it.next()).value).toMatchObject({ message: { body: 'orphan' } });
  });

  it('history() times out to an empty page and does not leak the waiter', async () => {
    const server = new FakeServer();
    const adapter = new IrcAdapter();
    const p = adapter.connect(creds(), server);
    await tick();
    server.send('CAP * LS :chathistory', 'CAP ada ACK :chathistory', ':irc 001 ada :hi');
    const session = (await p) as IrcSession;
    // resolve immediately by ending the session — the pending waiter resolves []
    const histP = adapter.history(session, '#c', 'msgid');
    await adapter.disconnect(session);
    expect(await histP).toEqual({ messages: [], nextCursor: null });
  });

  it('changeNick writes a NICK line', async () => {
    const { adapter, server, session } = await connected();
    await adapter.changeNick(session, 'ada2');
    expect(server.lastWritten()).toBe('NICK ada2');
  });

  it('setRoomTopic writes a TOPIC line (empty string clears)', async () => {
    const { adapter, server, session } = await connected();
    await adapter.setRoomTopic(session, '#chan', 'new direction');
    expect(server.lastWritten()).toBe('TOPIC #chan :new direction');
    await adapter.setRoomTopic(session, '#chan', '');
    expect(server.lastWritten()).toBe('TOPIC #chan :');
  });

  it('inviteToRoom writes an INVITE line', async () => {
    const { adapter, server, session } = await connected();
    await adapter.inviteToRoom?.(session, '#chan', 'carol');
    expect(server.lastWritten()).toBe('INVITE carol #chan');
  });

  it('disconnect is best-effort when the socket throws', async () => {
    const { adapter, session, server } = await connected();
    server.stub(() => {
      throw new Error('EPIPE');
    });
    await expect(adapter.disconnect(session)).resolves.toBeUndefined();
    expect(session.closed).toBe(true);
  });

  it('a malformed / unmodelled inbound line is swallowed', async () => {
    const { adapter, server, session } = await connected();
    const it = adapter.events(session)[Symbol.asyncIterator]();
    server.send('', ':srv 366 ada #c :End of NAMES'); // empty + a numeric we do not model
    server.send(':bob!b@h PRIVMSG #c :real');
    expect((await it.next()).value).toMatchObject({ message: { body: 'real' } });
  });
});
