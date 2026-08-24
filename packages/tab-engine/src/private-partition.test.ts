import { describe, expect, it } from 'vitest';
import { DIRECT_PARTITION, partitionKeyFor } from './connection-binding';
import { isPrivatePartition, PRIVATE_PARTITION, privatePartitionKey } from './private-partition';

/**
 * "Leaves nothing on close" is, at bottom, a property of the partition NAME: Electron persists a
 * partition to disk if and only if the name starts with `persist:`. So the first test here is the one
 * the whole feature rests on, and it is written as a property of every name this module can produce
 * rather than as a spot check on one string.
 */
describe('the private partition is never persisted', () => {
  it('has no persist: prefix — the missing prefix IS the feature', () => {
    expect(PRIVATE_PARTITION.startsWith('persist:')).toBe(false);
  });

  it('produces no persisted name for ANY connection', () => {
    for (const id of ['tor', 'vpn-a', 'wg1', 'a', 'z-9']) {
      expect(privatePartitionKey({ connectionId: id }).startsWith('persist:')).toBe(false);
    }
    expect(privatePartitionKey({ connectionId: null }).startsWith('persist:')).toBe(false);
  });

  it('is never the ordinary browsing partition, which IS persisted', () => {
    expect(DIRECT_PARTITION.startsWith('persist:')).toBe(true);
    expect(privatePartitionKey({ connectionId: null })).not.toBe(DIRECT_PARTITION);
    expect(privatePartitionKey({ connectionId: 'tor' })).not.toBe(
      partitionKeyFor({ connectionId: 'tor' }),
    );
  });
});

describe('privatePartitionKey', () => {
  it('keeps a private tab on the profile’s tunnel rather than the clear path', () => {
    // Ignoring the route here would send private traffic out untunneled — the failure the
    // new-tab-session provider exists to prevent, at its worst in the mode whose promise is privacy.
    expect(privatePartitionKey({ connectionId: 'tor' })).toBe('tepegoz-private--conn-tor');
  });

  it('mirrors partitionKeyFor’s shape, so the two cannot drift', () => {
    const ordinary = partitionKeyFor({ connectionId: 'vpn-a' });
    const priv = privatePartitionKey({ connectionId: 'vpn-a' });
    expect(ordinary.endsWith('--conn-vpn-a')).toBe(true);
    expect(priv.endsWith('--conn-vpn-a')).toBe(true);
  });

  it('throws on an id that is not a safe partition component', () => {
    // Quietly folding `vpn/a` and `vpn-a` onto one partition would put two connections' traffic in one
    // cookie jar. A throw is recoverable; that bleed is not.
    expect(() => privatePartitionKey({ connectionId: 'vpn/a' })).toThrow();
    expect(() => privatePartitionKey({ connectionId: '../escape' })).toThrow();
  });
});

describe('isPrivatePartition', () => {
  it('recognises the base and the tunnel siblings', () => {
    expect(isPrivatePartition(PRIVATE_PARTITION)).toBe(true);
    expect(isPrivatePartition('tepegoz-private--conn-tor')).toBe(true);
  });

  it('does NOT claim the ordinary partitions', () => {
    expect(isPrivatePartition(DIRECT_PARTITION)).toBe(false);
    expect(isPrivatePartition(partitionKeyFor({ connectionId: 'tor' }))).toBe(false);
    expect(isPrivatePartition('persist:tepegoz-app')).toBe(false);
  });

  it('is not fooled by a name that merely starts with the same letters', () => {
    // `persist:tepegoz-private-ish` must not be treated as disposable — it would be a persisted
    // partition the cleanup path believed it could throw away.
    expect(isPrivatePartition('persist:tepegoz-private')).toBe(false);
    expect(isPrivatePartition('tepegoz-private-ish')).toBe(false);
  });
});
