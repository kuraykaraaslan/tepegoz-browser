import { describe, expect, it } from 'vitest';
import { PolicyBundleSchema } from './policy-bundle';

const bundle = (over: Record<string, unknown> = {}) => ({
  id: '00000000-0000-4000-8000-000000000001',
  name: 'Paranoid Default',
  version: '1.0.0',
  allowedToolIds: ['browser_get_page'],
  allowedDomains: null,
  ...over,
});

describe('the PolicyBundle shape', () => {
  it('parses a well-formed root bundle', () => {
    expect(PolicyBundleSchema.safeParse(bundle()).success).toBe(true);
  });

  it('accepts an EMPTY allowedToolIds — a bundle with no entries permits nothing', () => {
    expect(PolicyBundleSchema.safeParse(bundle({ allowedToolIds: [] })).success).toBe(true);
  });

  it('distinguishes null (no domain restriction) from an empty array (no domain permitted)', () => {
    const noRestriction = PolicyBundleSchema.parse(bundle({ allowedDomains: null }));
    const noneAllowed = PolicyBundleSchema.parse(bundle({ allowedDomains: [] }));
    expect(noRestriction.allowedDomains).toBeNull();
    expect(noneAllowed.allowedDomains).toEqual([]);
  });

  it('accepts a parentId, and omits it cleanly when this is a root bundle', () => {
    expect(
      PolicyBundleSchema.safeParse(bundle({ parentId: '00000000-0000-4000-8000-000000000002' })).success,
    ).toBe(true);
    expect(PolicyBundleSchema.parse(bundle()).parentId).toBeUndefined();
  });
});
