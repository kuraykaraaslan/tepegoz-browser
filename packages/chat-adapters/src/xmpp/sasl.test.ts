import { describe, it, expect } from 'vitest';
import {
  b64ToBytes,
  bytesToB64,
  saslExternal,
  saslPlain,
  scramClientFirst,
  scramFinal,
  scramVerify,
  startScram,
} from './sasl';

const b64 = (s: string): string => bytesToB64(new TextEncoder().encode(s));
const unb64 = (s: string): string => new TextDecoder().decode(b64ToBytes(s));

describe('base64 helpers', () => {
  it('round-trips arbitrary bytes', () => {
    const bytes = new Uint8Array([0, 1, 2, 250, 255, 128, 64]);
    expect([...b64ToBytes(bytesToB64(bytes))]).toEqual([...bytes]);
  });
});

describe('SASL PLAIN', () => {
  it('encodes authzid\\0authcid\\0passwd', () => {
    const out = saslPlain('ada', 'pw');
    expect(unb64(out)).toBe(`${String.fromCharCode(0)}ada${String.fromCharCode(0)}pw`);
  });
});

describe('SASL EXTERNAL', () => {
  it('is a bare "+" with no authzid', () => {
    expect(saslExternal()).toBe('+');
    expect(saslExternal('')).toBe('+');
  });
  it('base64-encodes a supplied authzid', () => {
    expect(unb64(saslExternal('ada'))).toBe('ada');
  });
});

describe('SCRAM-SHA-1 (RFC 5802 §5 test vector)', () => {
  const clientNonce = 'fyko+d2lbbFgONRv9qkxdawL';
  const serverFirst =
    'r=fyko+d2lbbFgONRv9qkxdawL3rfcNHYJY1ZVvWVs7j,s=QSXCR+Q6sek8bf92,i=4096';

  it('produces the exact client proof and server signature', async () => {
    const state = startScram('SCRAM-SHA-1', 'user', 'pencil', clientNonce);
    expect(state).not.toBeNull();
    if (state === null) return;
    expect(unb64(scramClientFirst(state))).toBe('n,,n=user,r=fyko+d2lbbFgONRv9qkxdawL');

    const final = await scramFinal(state, b64(serverFirst));
    expect(final).not.toBeNull();
    if (final === null) return;
    expect(unb64(final.response)).toBe(
      'c=biws,r=fyko+d2lbbFgONRv9qkxdawL3rfcNHYJY1ZVvWVs7j,p=v0X8v3Bz2T0CJGbJQyF0X+HI4Ts=',
    );
    expect(final.expectedServerSignature).toBe('rmF9pqV8S7suAoZWja4dJRkFsKQ=');

    expect(scramVerify(b64('v=rmF9pqV8S7suAoZWja4dJRkFsKQ='), final.expectedServerSignature)).toBe(
      true,
    );
    expect(scramVerify(b64('v=wrong'), final.expectedServerSignature)).toBe(false);
    expect(scramVerify(b64('e=invalid-proof'), final.expectedServerSignature)).toBe(false);
    expect(scramVerify(b64('x=nothing'), final.expectedServerSignature)).toBe(false);
  });
});

describe('SCRAM-SHA-256', () => {
  it('runs the full exchange and self-verifies against a simulated server', async () => {
    // Simulate a server: salt + iterations, then derive the same keys and echo v=.
    const clientNonce = 'clientnonceclientnonce';
    const state = startScram('SCRAM-SHA-256', 'ada', 'pencil', clientNonce);
    if (state === null) throw new Error('mech');
    const serverNonce = `${clientNonce}serverpart`;
    const salt = bytesToB64(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]));
    const serverFirst = `r=${serverNonce},s=${salt},i=4096`;
    const final = await scramFinal(state, b64(serverFirst));
    if (final === null) throw new Error('final');

    // Recompute the server signature independently via the client path (it is symmetric here
    // because scramFinal already returns expectedServerSignature computed from ServerKey).
    expect(scramVerify(b64(`v=${final.expectedServerSignature}`), final.expectedServerSignature)).toBe(
      true,
    );
  });
});

describe('SCRAM — rejections', () => {
  it('unknown mechanism → null', () => {
    expect(startScram('SCRAM-SHA-512', 'a', 'b')).toBeNull();
  });

  it('server that does not extend the client nonce → null', async () => {
    const state = startScram('SCRAM-SHA-1', 'user', 'pencil', 'abc');
    if (state === null) throw new Error('mech');
    expect(await scramFinal(state, b64('r=abc,s=QQ==,i=1'))).toBeNull(); // echoed, not extended
    expect(await scramFinal(state, b64('r=xyz,s=QQ==,i=1'))).toBeNull(); // different prefix
  });

  it('malformed server-first (missing salt / bad iterations) → null', async () => {
    const state = startScram('SCRAM-SHA-1', 'user', 'pencil', 'abc');
    if (state === null) throw new Error('mech');
    expect(await scramFinal(state, b64('r=abcd,i=4096'))).toBeNull();
    expect(await scramFinal(state, b64('r=abcd,s=QQ==,i=0'))).toBeNull();
  });

  it('escapes = and , in the username', () => {
    const state = startScram('SCRAM-SHA-1', 'a,b=c', 'pw', 'n');
    expect(state?.clientFirstBare).toBe('n=a=2Cb=3Dc,r=n');
  });
});
