import { describe, it, expect, beforeEach } from 'vitest';
import { openDatabase, migrate, BlobStore, type Db } from './index';

describe('BlobStore', () => {
  let db: Db;
  beforeEach(() => {
    db = openDatabase(':memory:');
    migrate(db);
  });

  it('stores and retrieves by content hash', () => {
    const ref = BlobStore.put(db, Buffer.from('hello tepegöz'));
    expect(ref).toMatch(/^cas:\/\/[a-f0-9]{64}$/);
    expect(BlobStore.get(db, ref)?.toString()).toBe('hello tepegöz');
  });

  it('dedupes identical content', () => {
    const r1 = BlobStore.put(db, Buffer.from('same'));
    const r2 = BlobStore.put(db, Buffer.from('same'));
    expect(r1).toBe(r2);
    expect(BlobStore.count(db)).toBe(1);
  });

  it('returns undefined for a missing blob', () => {
    expect(BlobStore.get(db, 'cas://' + '0'.repeat(64))).toBeUndefined();
  });
});
