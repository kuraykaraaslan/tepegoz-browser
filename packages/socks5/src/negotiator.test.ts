import { describe, it, expect } from 'vitest';
import { Socks5Negotiator } from './negotiator';

const bytes = (...n: number[]): Uint8Array => Uint8Array.from(n);

describe('Socks5Negotiator — greeting', () => {
  it('starts with version + one no-auth method', () => {
    const neg = new Socks5Negotiator({ host: 'x.com', port: 5222 });
    expect([...neg.start()]).toEqual([0x05, 0x01, 0x00]);
  });

  it('sends a domain CONNECT request once the proxy accepts no-auth', () => {
    const neg = new Socks5Negotiator({ host: 'xmpp.example', port: 5222 });
    neg.start();
    const step = neg.feed(bytes(0x05, 0x00));
    expect(step.send).toBeDefined();
    const req = [...(step.send ?? [])];
    // VER CMD RSV ATYP  |  LEN "xmpp.example"  |  PORT
    expect(req.slice(0, 4)).toEqual([0x05, 0x01, 0x00, 0x03]);
    expect(req[4]).toBe('xmpp.example'.length);
    expect(String.fromCharCode(...req.slice(5, 5 + 12))).toBe('xmpp.example');
    expect(req.slice(-2)).toEqual([5222 >> 8, 5222 & 0xff]);
  });

  it('encodes an IPv4 literal as ATYP 1', () => {
    const neg = new Socks5Negotiator({ host: '10.0.0.1', port: 443 });
    neg.start();
    const req = [...(neg.feed(bytes(0x05, 0x00)).send ?? [])];
    expect(req.slice(0, 4)).toEqual([0x05, 0x01, 0x00, 0x01]);
    expect(req.slice(4, 8)).toEqual([10, 0, 0, 1]);
  });

  it('encodes an IPv6 literal as ATYP 4', () => {
    const neg = new Socks5Negotiator({ host: '2001:db8::1', port: 443 });
    neg.start();
    const req = [...(neg.feed(bytes(0x05, 0x00)).send ?? [])];
    expect(req[3]).toBe(0x04);
    expect(req.slice(4, 20)).toEqual([0x20, 0x01, 0x0d, 0xb8, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1]);
  });

  it('waits for the full 2-byte method reply', () => {
    const neg = new Socks5Negotiator({ host: 'x', port: 1 });
    neg.start();
    expect(neg.feed(bytes(0x05))).toEqual({});
    expect(neg.feed(bytes(0x00)).send).toBeDefined();
  });

  it('fails on a bad version or a demanded auth method', () => {
    const a = new Socks5Negotiator({ host: 'x', port: 1 });
    a.start();
    expect(a.feed(bytes(0x04, 0x00)).error).toMatch(/bad version/);

    const b = new Socks5Negotiator({ host: 'x', port: 1 });
    b.start();
    expect(b.feed(bytes(0x05, 0x02)).error).toMatch(/demands auth/);
    expect(b.state).toBe('failed');
    expect(b.feed(bytes(0x05, 0x00)).error).toMatch(/already failed/);
  });
});

describe('Socks5Negotiator — CONNECT reply', () => {
  function toReply(neg: Socks5Negotiator): void {
    neg.start();
    neg.feed(bytes(0x05, 0x00));
  }

  it('completes on a success reply with an IPv4 bound address', () => {
    const neg = new Socks5Negotiator({ host: 'x.com', port: 5222 });
    toReply(neg);
    const step = neg.feed(bytes(0x05, 0x00, 0x00, 0x01, 0, 0, 0, 0, 0x00, 0x00));
    expect(step).toEqual({ done: true });
    expect(neg.state).toBe('done');
    expect(neg.feed(bytes(1, 2, 3))).toEqual({ done: true });
  });

  it('handles a domain-typed bound address (variable length)', () => {
    const neg = new Socks5Negotiator({ host: 'x.com', port: 5222 });
    toReply(neg);
    // ATYP 3, len 3, "abc", port 00 00 — split across two feeds
    expect(neg.feed(bytes(0x05, 0x00, 0x00, 0x03, 0x03))).toEqual({});
    expect(neg.feed(bytes(0x61, 0x62, 0x63, 0x00, 0x00))).toEqual({ done: true });
  });

  it('reports a refused / unreachable reply code', () => {
    const neg = new Socks5Negotiator({ host: 'x.com', port: 5222 });
    toReply(neg);
    const step = neg.feed(bytes(0x05, 0x05, 0x00, 0x01, 0, 0, 0, 0, 0, 0));
    expect(step.error).toMatch(/connection refused/);
    expect(neg.state).toBe('failed');
  });

  it('waits for the domain length byte before sizing the reply', () => {
    const neg = new Socks5Negotiator({ host: 'x', port: 1 });
    toReply(neg);
    expect(neg.feed(bytes(0x05, 0x00, 0x00, 0x03))).toEqual({}); // no length byte yet
    expect(neg.feed(bytes(0x02, 0x61, 0x62, 0x00, 0x00)).done).toBe(true);
  });

  it('names an unknown reply code numerically', () => {
    const neg = new Socks5Negotiator({ host: 'x', port: 1 });
    toReply(neg);
    expect(neg.feed(bytes(0x05, 0x42, 0x00, 0x01, 0, 0, 0, 0, 0, 0)).error).toMatch(/0x42/);
  });

  it('rejects an unknown ATYP and a bad version in the reply', () => {
    const a = new Socks5Negotiator({ host: 'x', port: 1 });
    toReply(a);
    expect(a.feed(bytes(0x05, 0x00, 0x00, 0x09)).error).toMatch(/unknown ATYP/);

    const b = new Socks5Negotiator({ host: 'x', port: 1 });
    toReply(b);
    expect(b.feed(bytes(0x04, 0x00, 0x00, 0x01, 0, 0, 0, 0, 0, 0)).error).toMatch(/bad version/);
  });

  it('waits for the whole reply before deciding', () => {
    const neg = new Socks5Negotiator({ host: 'x', port: 1 });
    toReply(neg);
    expect(neg.feed(bytes(0x05, 0x00, 0x00))).toEqual({});
    expect(neg.feed(bytes(0x01, 0, 0, 0, 0, 0, 0)).done).toBe(true);
  });
});

describe('Socks5Negotiator — address parsing edge cases', () => {
  it('treats an over-range dotted quad as a domain, not IPv4', () => {
    const neg = new Socks5Negotiator({ host: '999.1.1.1', port: 1 });
    neg.start();
    const req = [...(neg.feed(bytes(0x05, 0x00)).send ?? [])];
    expect(req[3]).toBe(0x03); // domain
  });

  it('rejects a malformed IPv6 (falls back to domain)', () => {
    const neg = new Socks5Negotiator({ host: '2001:db8:::1', port: 1 });
    neg.start();
    const req = [...(neg.feed(bytes(0x05, 0x00)).send ?? [])];
    expect(req[3]).toBe(0x03);
  });
});
