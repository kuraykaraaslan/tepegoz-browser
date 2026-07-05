import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { AppError } from '@tepegoz/libs';
import type { FileAccessGrant } from '@tepegoz/shared-types/file-access';
import { FileAccessPolicy } from './file-access-policy';

const ROOT = path.resolve('sandbox-root');
const SUB = path.join(ROOT, 'nested', 'deep');
const FILE = path.join(ROOT, 'a.txt');
const DEEP_FILE = path.join(SUB, 'b.txt');
const OUTSIDE = path.resolve('other-root', 'x.txt');
const TRAVERSAL = path.join(ROOT, '..', 'escape.txt'); // resolves outside ROOT

function grant(over: Partial<FileAccessGrant> = {}): FileAccessGrant {
  return { path: ROOT, mode: 'read-write', recursive: true, ...over };
}

describe('FileAccessPolicy.resolveGrant', () => {
  it('matches the folder itself and nested files when recursive', () => {
    const p = new FileAccessPolicy([grant()]);
    expect(p.resolveGrant(ROOT)?.path).toBe(ROOT);
    expect(p.resolveGrant(FILE)?.path).toBe(ROOT);
    expect(p.resolveGrant(DEEP_FILE)?.path).toBe(ROOT);
  });

  it('rejects paths outside every grant, including `..` traversal', () => {
    const p = new FileAccessPolicy([grant()]);
    expect(p.resolveGrant(OUTSIDE)).toBeNull();
    expect(p.resolveGrant(path.resolve(TRAVERSAL))).toBeNull();
  });

  it('honors recursive:false — only direct children, not deep descendants', () => {
    const p = new FileAccessPolicy([grant({ recursive: false })]);
    expect(p.resolveGrant(FILE)?.path).toBe(ROOT); // direct child
    expect(p.resolveGrant(DEEP_FILE)).toBeNull(); // nested
  });

  it('picks the most-specific (longest) grant when several overlap', () => {
    const p = new FileAccessPolicy([grant({ mode: 'read' }), grant({ path: SUB, mode: 'full' })]);
    expect(p.resolveGrant(DEEP_FILE)?.path).toBe(SUB);
    expect(p.resolveGrant(DEEP_FILE)?.mode).toBe('full');
  });
});

describe('FileAccessPolicy.assertMembership', () => {
  it('throws 403 for a path outside all grants', () => {
    const p = new FileAccessPolicy([grant()]);
    expect(() => p.assertMembership(OUTSIDE)).toThrowError(AppError);
    try {
      p.assertMembership(OUTSIDE);
    } catch (e) {
      expect((e as AppError).statusCode).toBe(403);
    }
  });

  it('passes for a path inside a grant', () => {
    const p = new FileAccessPolicy([grant()]);
    expect(() => p.assertMembership(FILE)).not.toThrow();
  });
});

describe('FileAccessPolicy.decide (the mode gate)', () => {
  it('allows an op within the grant mode (auto, no prompt)', () => {
    const p = new FileAccessPolicy([grant({ mode: 'full' })]);
    expect(p.decide(FILE, 'read')).toBe('allow');
    expect(p.decide(FILE, 'read-write')).toBe('allow');
    expect(p.decide(FILE, 'full')).toBe('allow');
  });

  it('asks when an op exceeds the grant mode (escalation prompt)', () => {
    const p = new FileAccessPolicy([grant({ mode: 'read' })]);
    expect(p.decide(FILE, 'read')).toBe('allow');
    expect(p.decide(FILE, 'read-write')).toBe('ask'); // write on a read-only folder
    expect(p.decide(FILE, 'full')).toBe('ask'); // delete on a read-only folder
  });

  it('denies when the path is in no grant', () => {
    const p = new FileAccessPolicy([grant()]);
    expect(p.decide(OUTSIDE, 'read')).toBe('deny');
    expect(p.decide(OUTSIDE, 'full')).toBe('deny');
  });
});

describe('FileAccessPolicy.setGrants', () => {
  it('swaps the live grant set', () => {
    const p = new FileAccessPolicy([grant()]);
    expect(p.isWithinAnyGrant(FILE)).toBe(true);
    p.setGrants([]);
    expect(p.isWithinAnyGrant(FILE)).toBe(false);
  });
});
