import { describe, expect, it } from 'vitest';
import {
  AddNetworkConnectionSchema,
  BindGroupNetworkSchema,
  BindTabNetworkSchema,
  RemoveNetworkConnectionSchema,
  ScopeBindingInputSchema,
  SetBinaryPathSchema,
  SetConnectionActiveSchema,
  SetGeneralBindingSchema,
  VpnBinarySchema,
} from './schemas-network';

/**
 * Renderer → main payloads for the Phase 5 network-privacy bridge. Everything here is `safeParse`d at
 * the handler; the connection id in particular names a session partition, so a malformed one must fail
 * to parse rather than escape the partition namespace or collide two connections into one cookie jar.
 */

describe('ScopeBindingInputSchema', () => {
  it('accepts inherit / direct / connection(id) and rejects a bad connection id', () => {
    expect(ScopeBindingInputSchema.parse({ kind: 'inherit' })).toEqual({ kind: 'inherit' });
    expect(ScopeBindingInputSchema.parse({ kind: 'direct' })).toEqual({ kind: 'direct' });
    expect(
      ScopeBindingInputSchema.parse({ kind: 'connection', connectionId: 'conn-abc' }),
    ).toMatchObject({ kind: 'connection' });
    expect(
      ScopeBindingInputSchema.safeParse({ kind: 'connection', connectionId: 'Conn ABC' }).success,
    ).toBe(false);
    expect(ScopeBindingInputSchema.safeParse({ kind: 'nope' }).success).toBe(false);
  });
});

describe('BindTabNetworkSchema / BindGroupNetworkSchema', () => {
  it('wrap a bounded id + a scope binding', () => {
    expect(
      BindTabNetworkSchema.parse({ tabId: 't1', binding: { kind: 'direct' } }),
    ).toMatchObject({ tabId: 't1' });
    expect(
      BindGroupNetworkSchema.parse({ groupId: 'g1', binding: { kind: 'inherit' } }),
    ).toMatchObject({ groupId: 'g1' });
    expect(BindTabNetworkSchema.safeParse({ tabId: '', binding: { kind: 'direct' } }).success).toBe(
      false,
    );
  });
});

describe('SetGeneralBindingSchema', () => {
  it('is the shared general-binding union (direct | connection)', () => {
    expect(SetGeneralBindingSchema.parse({ kind: 'direct' })).toEqual({ kind: 'direct' });
    expect(SetGeneralBindingSchema.safeParse({ kind: 'inherit' }).success).toBe(false);
  });
});

describe('AddNetworkConnectionSchema', () => {
  const base = { label: 'Home', note: '' };

  it('accepts each protocol arm with its own security-relevant field', () => {
    expect(
      AddNetworkConnectionSchema.parse({ ...base, kind: 'wireguard', sourcePath: '/wg.conf' }),
    ).toMatchObject({ kind: 'wireguard' });
    expect(
      AddNetworkConnectionSchema.parse({ ...base, kind: 'tor', upstreamConnectionId: null }),
    ).toMatchObject({ kind: 'tor' });
    expect(
      AddNetworkConnectionSchema.parse({ ...base, kind: 'byo-socks', socksPort: 9050 }),
    ).toMatchObject({ socksPort: 9050 });
  });

  it('rejects an out-of-range SOCKS port, an empty wireguard path, and an unknown kind', () => {
    expect(
      AddNetworkConnectionSchema.safeParse({ ...base, kind: 'byo-socks', socksPort: 70000 }).success,
    ).toBe(false);
    expect(
      AddNetworkConnectionSchema.safeParse({ ...base, kind: 'wireguard', sourcePath: '' }).success,
    ).toBe(false);
    expect(AddNetworkConnectionSchema.safeParse({ ...base, kind: 'l2tp' }).success).toBe(false);
  });
});

describe('the small connection-management schemas', () => {
  it('RemoveNetworkConnectionSchema is a bare connection id', () => {
    expect(RemoveNetworkConnectionSchema.parse('conn-x')).toBe('conn-x');
    expect(RemoveNetworkConnectionSchema.safeParse('NOPE').success).toBe(false);
  });

  it('SetConnectionActiveSchema is { id, active }', () => {
    expect(SetConnectionActiveSchema.parse({ id: 'conn-x', active: true })).toEqual({
      id: 'conn-x',
      active: true,
    });
    expect(SetConnectionActiveSchema.safeParse({ id: 'conn-x', active: 'yes' }).success).toBe(false);
  });

  it('SetBinaryPathSchema / VpnBinarySchema bound the helper binary name', () => {
    expect(SetBinaryPathSchema.parse({ binary: 'tor', path: '/opt/tor' })).toMatchObject({
      binary: 'tor',
    });
    expect(SetBinaryPathSchema.safeParse({ binary: 'openvpn', path: '/x' }).success).toBe(false);
    expect(VpnBinarySchema.parse('wireproxy')).toBe('wireproxy');
    expect(VpnBinarySchema.safeParse('shadowsocks').success).toBe(false);
  });
});
