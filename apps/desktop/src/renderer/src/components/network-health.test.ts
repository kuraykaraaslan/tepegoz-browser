import { describe, expect, it } from 'vitest';
import type { ConnectionHealth } from '@tepegoz/shared-types';
import { handshakeSuccessRate, parseConnectionHealth } from './network-health';

/**
 * The renderer's read of a connection's per-session health. The IPC read is `safeParse`d at this
 * boundary (Phase 5 health rides the `network:get-state` payload, which crosses the untrusted-renderer
 * line): a record that does not validate must yield `null`, not a thrown error or a wrong number.
 */

const ok: ConnectionHealth = {
  lastHandshakeAt: 1_000,
  lastErrorAt: null,
  handshakesOk: 3,
  handshakesFailed: 1,
  reconnects: 2,
};

describe('parseConnectionHealth', () => {
  it('accepts a well-formed record and drops the connection-view fields around it', () => {
    const parsed = parseConnectionHealth({ ...ok, id: 'c1', label: 'FRA', kind: 'wireguard' });
    expect(parsed).toEqual(ok);
  });

  it('accepts null timestamps (a connection that has never come up / never failed)', () => {
    expect(parseConnectionHealth({ ...ok, lastHandshakeAt: null, lastErrorAt: null })).not.toBeNull();
  });

  it.each([
    ['a negative counter', { ...ok, reconnects: -1 }],
    ['a fractional counter', { ...ok, handshakesOk: 1.5 }],
    ['a missing field', { lastHandshakeAt: null, lastErrorAt: null, handshakesOk: 0 }],
    ['a string timestamp', { ...ok, lastErrorAt: 'yesterday' }],
    ['not an object', 42],
    ['null', null],
  ])('rejects %s → null', (_label, raw) => {
    expect(parseConnectionHealth(raw)).toBeNull();
  });
});

describe('handshakeSuccessRate', () => {
  it('is a whole-number percentage of ok / (ok + failed)', () => {
    expect(handshakeSuccessRate({ ...ok, handshakesOk: 3, handshakesFailed: 1 })).toBe(75);
    expect(handshakeSuccessRate({ ...ok, handshakesOk: 4, handshakesFailed: 0 })).toBe(100);
  });

  it('is null when nothing has been attempted — not 0% and not NaN', () => {
    expect(handshakeSuccessRate({ ...ok, handshakesOk: 0, handshakesFailed: 0 })).toBeNull();
  });
});
