import { describe, it, expect, vi } from 'vitest';
import { ChatAccountRunner } from './account-runner';
import {
  tick,
  FakeAdapter,
  FakeStore,
  account,
  type Deps,
  makeDeps,
  incomingMessage,
  online,
} from './account-runner.test-kit';

describe('ChatAccountRunner — actions', () => {
  describe('resolveMedia', () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    const fetchOk = vi.fn(() =>
      Promise.resolve({
        status: 200,
        headers: { 'content-type': 'image/png; charset=binary' },
        text: () => Promise.resolve(''),
        bytes: () => Promise.resolve(png),
      }),
    );

    it('resolves an mxc ref to a size-capped, sanitized data URL via the egress-bound transport', async () => {
      const { runner, adapter } = await online({
        transport: { fetch: fetchOk } as unknown as Deps['transport'],
      });
      const out = await runner.resolveMedia('mxc://hs.example/AbC');
      expect(adapter.resolveMedia).toHaveBeenCalledWith(expect.anything(), 'mxc://hs.example/AbC');
      expect(fetchOk).toHaveBeenCalledWith(
        'https://hs.example/media/hs.example/AbC',
        expect.objectContaining({ method: 'GET', headers: { authorization: 'Bearer t' } }),
      );
      expect(out).toEqual({
        dataUrl: `data:image/png;base64,${Buffer.from(png).toString('base64')}`,
      });
    });

    it('returns null when the adapter cannot resolve the ref', async () => {
      const { runner } = await online({
        transport: { fetch: fetchOk } as unknown as Deps['transport'],
      });
      expect(await runner.resolveMedia('https://not-a-ref/x')).toBeNull();
    });

    it('returns null on an oversized download', async () => {
      const big = new Uint8Array(13 * 1024 * 1024);
      const fetchBig = vi.fn(() =>
        Promise.resolve({
          status: 200,
          headers: {},
          text: () => Promise.resolve(''),
          bytes: () => Promise.resolve(big),
        }),
      );
      const { runner } = await online({
        transport: { fetch: fetchBig } as unknown as Deps['transport'],
      });
      expect(await runner.resolveMedia('mxc://hs.example/big')).toBeNull();
    });

    it('throws when the kill-switch trips after connect', async () => {
      let egress = true;
      const { runner } = await online({
        transport: { fetch: fetchOk } as unknown as Deps['transport'],
        mayEgress: () => egress,
      });
      egress = false;
      await expect(runner.resolveMedia('mxc://hs.example/AbC')).rejects.toThrow(/kill-switch/);
    });

    it('returns null when the adapter has no media repo', async () => {
      const { runner, adapter } = await online({
        transport: { fetch: fetchOk } as unknown as Deps['transport'],
      });
      Reflect.deleteProperty(adapter, 'resolveMedia');
      expect(await runner.resolveMedia('mxc://hs.example/AbC')).toBeNull();
    });
  });

  it('stop() disconnects and notifyEgressChange delegates', async () => {
    const { runner, adapter } = await online();
    await runner.stop();
    expect(adapter.disconnect).toHaveBeenCalled();
    runner.notifyEgressChange(); // no throw
  });

  it('emits a state change with a detail on connect failure', async () => {
    const adapter = new FakeAdapter();
    adapter.connect = vi.fn(() => Promise.reject(new Error('bad password')));
    const { deps, emitted } = makeDeps({ adapter, store: new FakeStore() });
    new ChatAccountRunner(deps).start();
    await tick();
    expect(emitted.find((e) => e.kind === 'state' && e.state === 'error')).toMatchObject({
      detail: 'bad password',
    });
  });

  it('treats a groupchat address (with a resource) as a room conversation', async () => {
    const { adapter, store } = await online();
    const base = incomingMessage('g1', 'hi').message;
    adapter.channel.push({
      type: 'message',
      message: { ...base, conversationId: 'room@conf/ada' },
    });
    await tick();
    expect(store.conversations.get('room@conf/ada')?.kind).toBe('room');
  });

  it('derives the self identity per protocol (incl. the bridge fallback)', async () => {
    for (const [server, store] of [
      [
        { protocol: 'irc', server: 'irc.x', port: 6697, tls: true, nick: 'ada', sasl: false },
        new FakeStore(),
      ],
      [{ protocol: 'matrix', homeserverUrl: 'https://x', userId: '@ada:x' }, new FakeStore()],
      [{ protocol: 'bridge', bridgeId: 'telegram', config: {} }, new FakeStore()],
    ] as const) {
      const adapter = new FakeAdapter();
      const { deps } = makeDeps({ adapter, store });
      deps.account = { ...account, server: { ...server } };
      new ChatAccountRunner(deps).start();
      await tick();
      // a mention of the display name counts (proves selfNames was seeded whatever the protocol)
      adapter.channel.push(incomingMessage('m', 'hey Ada'));
      await tick();
      expect(store.conversations.get('bob@example.com')?.mentions).toBe(1);
    }
  });
});
