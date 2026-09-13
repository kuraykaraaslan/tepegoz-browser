import { describe, expect, it } from 'vitest';
import type { ChatSession } from '@tepegoz/chat-adapters';
import { XMPP_CAPS } from '@tepegoz/chat-adapters';
import { createChatEvalAdapter, createChatEvalTransport } from './chat-eval-adapter';

const session: ChatSession = { accountId: 'work', caps: XMPP_CAPS };

describe('createChatEvalAdapter — resolveMedia', () => {
  it('resolves a non-empty media ref to an eval-media: locator', () => {
    const adapter = createChatEvalAdapter('matrix');
    const locator = adapter.resolveMedia!(session, 'mxc://example.org/hero-v3-abc123');
    expect(locator).toEqual({
      url: `eval-media:${encodeURIComponent('mxc://example.org/hero-v3-abc123')}`,
      headers: {},
    });
  });

  it('resolves an empty media ref to null, same as a protocol with no media repo', () => {
    const adapter = createChatEvalAdapter('irc');
    expect(adapter.resolveMedia!(session, '')).toBeNull();
  });
});

describe('createChatEvalTransport', () => {
  it('fetch() resolves an eval-media: URL with real, decodable PNG bytes', async () => {
    const transport = createChatEvalTransport();
    const res = await transport.fetch('eval-media:mxc%3A%2F%2Fexample.org%2Fhero-v3-abc123');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('image/png');
    const bytes = await res.bytes();
    // PNG magic number: 89 50 4E 47 0D 0A 1A 0A
    expect(Array.from(bytes.slice(0, 8))).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  });

  it('fetch() rejects any URL that is not the eval-media: scheme — no real network during a trial', async () => {
    const transport = createChatEvalTransport();
    await expect(transport.fetch('https://example.com/real-media')).rejects.toThrow(/no real fetch/);
  });

  it('every other transport method rejects — none should ever be called during an eval trial', async () => {
    const transport = createChatEvalTransport();
    await expect(transport.openTCP({ host: 'x', port: 1, tls: false })).rejects.toThrow(/no real TCP/);
    await expect(
      transport.upgradeTLS({ write: () => undefined, onData: () => undefined, onClose: () => undefined, close: () => undefined }, { host: 'x' }),
    ).rejects.toThrow(/no real TLS upgrade/);
    await expect(transport.openWebSocket('wss://x')).rejects.toThrow(/no real WebSocket/);
    await expect(transport.openEventStream('https://x')).rejects.toThrow(/no real event stream/);
  });
});
