import { describe, it, expect } from 'vitest';
import { defineExtension, validateManifest } from './manifest';

const VALID = { id: 'agent', name: 'Agent', version: '0.1.0', kind: 'panel' } as const;

describe('extension manifest schema', () => {
  it('accepts a minimal valid manifest and applies defaults', () => {
    const m = defineExtension(VALID);
    expect(m.id).toBe('agent');
    expect(m.description).toBe(''); // default
    expect(m.permissions).toEqual([]); // default
  });

  it('keeps provided description + permissions', () => {
    const m = defineExtension({ ...VALID, description: 'Does things', permissions: ['tabs'] });
    expect(m.description).toBe('Does things');
    expect(m.permissions).toEqual(['tabs']);
  });

  it('rejects a non-kebab id', () => {
    expect(validateManifest({ ...VALID, id: 'Agent_1' }).success).toBe(false);
  });

  it('rejects a non-semver version', () => {
    expect(validateManifest({ ...VALID, version: '1.0' }).success).toBe(false);
  });

  it('rejects an unknown kind', () => {
    expect(validateManifest({ ...VALID, kind: 'iframe' }).success).toBe(false);
  });

  it('defineExtension throws on an invalid manifest', () => {
    expect(() => defineExtension({ id: 'x' })).toThrow();
  });
});
