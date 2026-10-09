import { describe, expect, it } from 'vitest';
import {
  BridgeLineError,
  bridgeTorrcLines,
  normalizeBridgeLine,
  parseBridgeLine,
} from './bridge-line';

const FP = 'A'.repeat(40);
const OBFS4 = `obfs4 192.0.2.1:443 ${FP} cert=abc123+/xyz iat-mode=0`;

describe('normalizeBridgeLine', () => {
  it('strips invisible characters, smart quotes and Unicode spaces', () => {
    const dirty = `\uFEFFobfs4\u00A0192.0.2.1:443\u200B ${FP}\u3000cert=abc\u00AD123 \u201Ciat-mode=0\u201D\r\n`;
    expect(normalizeBridgeLine(dirty)).toBe(`obfs4 192.0.2.1:443 ${FP} cert=abc123 iat-mode=0`);
  });

  it('drops a torrc "Bridge " prefix', () => {
    expect(normalizeBridgeLine('Bridge 192.0.2.1:9001')).toBe('192.0.2.1:9001');
  });

  it('maps typographic dashes to hyphen-minus', () => {
    expect(normalizeBridgeLine('iat\u2013mode=0')).toBe('iat-mode=0');
  });
});

describe('parseBridgeLine', () => {
  it('parses an obfs4 line and upper-cases the fingerprint', () => {
    const b = parseBridgeLine(OBFS4.replace(FP, FP.toLowerCase()));
    expect(b).toMatchObject({ transport: 'obfs4', address: '192.0.2.1:443', fingerprint: FP });
    expect(b.args).toEqual([
      ['cert', 'abc123+/xyz'],
      ['iat-mode', '0'],
    ]);
    expect(b.line).toBe(OBFS4);
  });

  it('accepts a plain bridge, with and without fingerprint, and IPv6', () => {
    expect(parseBridgeLine('192.0.2.1:9001').transport).toBeNull();
    expect(parseBridgeLine(`[2001:db8::1]:9001 ${FP}`).fingerprint).toBe(FP);
  });

  it('accepts snowflake without a fingerprint', () => {
    expect(parseBridgeLine('snowflake 192.0.2.3:80 url=https://x.example/').args).toEqual([
      ['url', 'https://x.example/'],
    ]);
  });

  it.each([
    ['', /empty/],
    ['carrier-pigeon 192.0.2.1:1', /Unknown transport/],
    ['192.0.2.1', /host:port/],
    ['192.0.2.1:70000', /out of range/],
    ['192.0.2.1:443 abcd', /40 hexadecimal/],
    [`obfs4 192.0.2.1:443 ${FP}`, /cert/],
    ['192.0.2.1:443 junk', /fingerprint|key=value/],
    [`${FP.slice(0, 0)}192.0.2.1:443\n192.0.2.2:443`, /several lines/],
  ])('rejects %j', (input, msg) => {
    expect(() => parseBridgeLine(input)).toThrow(BridgeLineError);
    expect(() => parseBridgeLine(input)).toThrow(msg);
  });
});

describe('bridgeTorrcLines', () => {
  it('emits nothing without bridges', () => {
    expect(bridgeTorrcLines([], {})).toEqual([]);
  });

  it('emits UseBridges, one plugin per transport, and each bridge', () => {
    const a = parseBridgeLine(OBFS4);
    const b = parseBridgeLine('192.0.2.9:9001');
    expect(bridgeTorrcLines([a, b], { obfs4: '/opt/lyrebird' })).toEqual([
      'UseBridges 1',
      'ClientTransportPlugin obfs4 exec /opt/lyrebird',
      `Bridge ${OBFS4}`,
      'Bridge 192.0.2.9:9001',
    ]);
  });

  it('refuses a transport with no binary', () => {
    expect(() => bridgeTorrcLines([parseBridgeLine(OBFS4)], {})).toThrow(/transport binary/);
  });
});
