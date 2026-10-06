import { describe, expect, it, vi } from 'vitest';
import { IrcAdapter, IrcSession } from './adapter';
import { FakeServer, connected } from './test-harness';

describe('IrcAdapter — flood protection', () => {
  const say = (adapter: IrcAdapter, session: IrcSession, body: string): void => {
    void adapter.sendMessage(session, '#c', { body, replyToId: null, mediaPath: null });
  };
  const privmsgs = (server: FakeServer): string[] =>
    server.written
      .filter((l) => l.startsWith('PRIVMSG #c :'))
      .map((l) => l.slice('PRIVMSG #c :'.length));

  it('lets a short burst through immediately, then paces the rest in order', async () => {
    const { adapter, server, session } = await connected();
    vi.useFakeTimers();
    try {
      const bodies = Array.from({ length: 12 }, (_, i) => `m${i}`);
      for (const b of bodies) say(adapter, session, b);

      // the burst window (8s budget / 2s penalty) admits the first few without delay…
      const first = privmsgs(server).length;
      expect(first).toBeGreaterThanOrEqual(4);
      expect(first).toBeLessThan(bodies.length);

      // …and advancing the clock drains the queue one line per penalty interval, in FIFO order.
      await vi.advanceTimersByTimeAsync(bodies.length * 2000);
      expect(privmsgs(server)).toEqual(bodies);
    } finally {
      vi.useRealTimers();
    }
  });

  it('PONG is never queued behind a saturated send queue', async () => {
    const { adapter, server, session } = await connected();
    vi.useFakeTimers();
    try {
      for (let i = 0; i < 20; i += 1) say(adapter, session, `x${i}`);
      server.send('PING :keepalive'); // arrives while the queue is backed up
      expect(server.written).toContain('PONG :keepalive');
    } finally {
      vi.useRealTimers();
    }
  });

  it('disconnect cancels the pending flush and drops queued lines', async () => {
    const { adapter, server, session } = await connected();
    vi.useFakeTimers();
    try {
      for (let i = 0; i < 20; i += 1) say(adapter, session, `x${i}`);
      const sentBeforeQuit = privmsgs(server).length;
      await adapter.disconnect(session);
      expect(server.written).toContain('QUIT :bye');

      await vi.advanceTimersByTimeAsync(120_000);
      expect(privmsgs(server)).toHaveLength(sentBeforeQuit); // nothing escaped after close
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('bounds the event queue for a stalled consumer (X-chat.10 memory)', async () => {
    const stream = { write: () => {}, onData: () => {}, onClose: () => {}, close: () => {} };
    const s = new IrcSession('acc', 'ada', stream);
    const line = {
      type: 'error' as const,
      scope: 'account' as const,
      conversationId: null,
      message: 'x',
    };
    for (let i = 0; i < 4_096 + 200; i += 1) s.push({ ...line });
    expect((s as unknown as { queue: unknown[] }).queue.length).toBe(4_096); // hard cap
    expect(s.droppedEvents).toBe(200);
    // the overflow notice is delivered out-of-band before the surviving backlog
    expect((await s.nextEvent()).value).toMatchObject({ type: 'error', scope: 'account' });
  });
});
