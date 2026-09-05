import { describe, expect, it } from 'vitest';
import { TURKIC_REGION_BASE_ISO, TURKIC_REGIONS, turkicFlagFor } from './turkic-regions';

/**
 * The non-ISO Turkic regions offered in the Region picker. `turkicFlagFor` resolves a code to its
 * bundled SVG asset URL (eagerly globbed at build time) case-insensitively, or `undefined` for a code
 * with no bundled flag.
 */

describe('turkicFlagFor', () => {
  it('resolves the bundled flag URL for a known code, case-insensitively', () => {
    const url = turkicFlagFor('TRN');
    expect(typeof url).toBe('string');
    expect(url?.length).toBeGreaterThan(0);
    expect(turkicFlagFor('trn')).toBe(url);
  });

  it('returns undefined for a code with no bundled flag', () => {
    expect(turkicFlagFor('not-a-real-code')).toBeUndefined();
  });
});

describe('TURKIC_REGION_BASE_ISO', () => {
  it('maps every region code to its ISO base for Intl formatting', () => {
    for (const region of TURKIC_REGIONS) {
      expect(TURKIC_REGION_BASE_ISO[region.code]).toBe(region.baseIso);
    }
  });
});
