import { describe, expect, it } from 'vitest';
import { MandateSchema } from './mandate';

const mandate = (over: Record<string, unknown> = {}) => ({
  id: '00000000-0000-4000-8000-000000000001',
  maxAmount: 500,
  currency: 'try',
  allowedDomains: ['shop.test'],
  expiresAt: Date.now() + 1000,
  usage: 'single_use',
  ...over,
});

describe('the Mandate shape', () => {
  it('parses a well-formed mandate', () => {
    expect(MandateSchema.safeParse(mandate()).success).toBe(true);
  });

  it('uppercases a lowercase currency code — never silently mismatches on case', () => {
    const parsed = MandateSchema.parse(mandate({ currency: 'try' }));
    expect(parsed.currency).toBe('TRY');
  });

  it('refuses a non-positive amount', () => {
    expect(MandateSchema.safeParse(mandate({ maxAmount: 0 })).success).toBe(false);
    expect(MandateSchema.safeParse(mandate({ maxAmount: -5 })).success).toBe(false);
  });

  it('refuses an EMPTY domain list — a mandate with no domain scope is a blank cheque', () => {
    expect(MandateSchema.safeParse(mandate({ allowedDomains: [] })).success).toBe(false);
  });

  it('refuses an unrecognised usage value', () => {
    expect(MandateSchema.safeParse(mandate({ usage: 'unlimited' })).success).toBe(false);
  });

  it('accepts an optional hitlThreshold, and omits it cleanly when absent', () => {
    expect(MandateSchema.safeParse(mandate({ hitlThreshold: 100 })).success).toBe(true);
    expect(MandateSchema.parse(mandate()).hitlThreshold).toBeUndefined();
  });
});
