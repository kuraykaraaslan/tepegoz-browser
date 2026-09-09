/**
 * SOCKS5 client CONNECT handshake (RFC 1928), no-auth only — the loopback proxy the network layer
 * hands back is trusted, so username/password is out of scope. Pure and incremental: `start()` gives
 * the bytes to send, `feed()` consumes server bytes and says what to send next / when the tunnel is
 * open / why it failed. The caller owns the socket; after `done` the same socket carries the tunneled
 * traffic.
 */

export interface Socks5Target {
  host: string;
  port: number;
}

export interface Socks5Step {
  /** Bytes to write to the proxy now. */
  send?: Uint8Array<ArrayBufferLike>;
  /** The tunnel is established — hand the socket to the real protocol. */
  done?: true;
  /** The handshake failed; the socket must be closed. */
  error?: string;
}

const VERSION = 0x05;
const NO_AUTH = 0x00;
const CMD_CONNECT = 0x01;
const ATYP_IPV4 = 0x01;
const ATYP_DOMAIN = 0x03;
const ATYP_IPV6 = 0x04;
const RSV = 0x00;

const REPLY: Record<number, string> = {
  0x00: 'succeeded',
  0x01: 'general SOCKS server failure',
  0x02: 'connection not allowed by ruleset',
  0x03: 'network unreachable',
  0x04: 'host unreachable',
  0x05: 'connection refused',
  0x06: 'TTL expired',
  0x07: 'command not supported',
  0x08: 'address type not supported',
};

type Phase = 'greeting' | 'request' | 'reply' | 'done' | 'failed';

export class Socks5Negotiator {
  private phase: Phase = 'greeting';
  private buffer: Uint8Array<ArrayBufferLike> = new Uint8Array(0);

  constructor(private readonly target: Socks5Target) {}

  get state(): Phase {
    return this.phase;
  }

  /** The client greeting: version, one method (no-auth). */
  start(): Uint8Array<ArrayBufferLike> {
    return Uint8Array.of(VERSION, 0x01, NO_AUTH);
  }

  feed(chunk: Uint8Array): Socks5Step {
    if (this.phase === 'done') return { done: true };
    if (this.phase === 'failed') return { error: 'handshake already failed' };

    this.buffer = concat(this.buffer, chunk);

    if (this.phase === 'greeting') {
      if (this.buffer.length < 2) return {};
      const ver = this.buffer[0] as number;
      const method = this.buffer[1] as number;
      this.buffer = this.buffer.slice(2);
      if (ver !== VERSION) return this.fail(`bad version 0x${ver.toString(16)} in method reply`);
      if (method !== NO_AUTH) return this.fail(`proxy demands auth method 0x${method.toString(16)}`);
      this.phase = 'reply';
      return { send: this.connectRequest() };
    }

    // phase === 'reply'
    return this.parseReply();
  }

  private connectRequest(): Uint8Array<ArrayBufferLike> {
    const { atyp, addr } = encodeAddress(this.target.host);
    const port = Uint8Array.of((this.target.port >> 8) & 0xff, this.target.port & 0xff);
    return concat(Uint8Array.of(VERSION, CMD_CONNECT, RSV, atyp), addr, port);
  }

  private parseReply(): Socks5Step {
    // header: VER REP RSV ATYP  (4 bytes) then the bound address + 2-byte port.
    if (this.buffer.length < 4) return {};
    const ver = this.buffer[0] as number;
    const rep = this.buffer[1] as number;
    const atyp = this.buffer[3] as number;
    if (ver !== VERSION) return this.fail(`bad version 0x${ver.toString(16)} in reply`);

    const addrLen =
      atyp === ATYP_IPV4 ? 4
      : atyp === ATYP_IPV6 ? 16
      : atyp === ATYP_DOMAIN ? (this.buffer.length >= 5 ? (this.buffer[4] as number) + 1 : Infinity)
      : NaN;
    if (Number.isNaN(addrLen)) return this.fail(`unknown ATYP 0x${atyp.toString(16)} in reply`);
    const total = 4 + addrLen + 2;
    if (this.buffer.length < total) return {};

    if (rep !== 0x00) return this.fail(`CONNECT failed: ${REPLY[rep] ?? `code 0x${rep.toString(16)}`}`);
    this.buffer = this.buffer.slice(total);
    this.phase = 'done';
    return { done: true };
  }

  private fail(message: string): Socks5Step {
    this.phase = 'failed';
    return { error: message };
  }
}

function encodeAddress(host: string): { atyp: number; addr: Uint8Array<ArrayBufferLike> } {
  const v4 = parseIpv4(host);
  if (v4 !== null) return { atyp: ATYP_IPV4, addr: v4 };
  const v6 = parseIpv6(host);
  if (v6 !== null) return { atyp: ATYP_IPV6, addr: v6 };
  const bytes = new TextEncoder().encode(host).subarray(0, 255);
  return { atyp: ATYP_DOMAIN, addr: concat(Uint8Array.of(bytes.length), bytes) };
}

function parseIpv4(host: string): Uint8Array<ArrayBufferLike> | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (m === null) return null;
  const parts = m.slice(1, 5).map(Number);
  if (parts.some((n) => n > 255)) return null;
  return Uint8Array.from(parts);
}

function parseIpv6(host: string): Uint8Array<ArrayBufferLike> | null {
  if (!host.includes(':')) return null;
  const clean = host.replace(/^\[|\]$/g, '');
  const halves = clean.split('::');
  if (halves.length > 2) return null;
  const head = halves[0] === '' ? [] : (halves[0]?.split(':') ?? []);
  const tail = halves.length === 2 ? (halves[1] === '' ? [] : (halves[1]?.split(':') ?? [])) : null;
  const groups =
    tail === null
      ? head
      : [...head, ...Array<string>(8 - head.length - tail.length).fill('0'), ...tail];
  if (groups.length !== 8) return null;
  const out = new Uint8Array(16);
  for (let i = 0; i < 8; i += 1) {
    const v = Number.parseInt(groups[i] ?? '', 16);
    if (!Number.isFinite(v) || v < 0 || v > 0xffff) return null;
    out[i * 2] = (v >> 8) & 0xff;
    out[i * 2 + 1] = v & 0xff;
  }
  return out;
}

function concat(...parts: Uint8Array<ArrayBufferLike>[]): Uint8Array<ArrayBufferLike> {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}
