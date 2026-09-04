import { describe, expect, it } from 'vitest';
import { TrustDomainSchema, TrustProfileSetSchema } from './schemas-trust';

/**
 * The runtime (zod) guards for the Scoped Trust Profiles IPC channel — the untrusted direction. A
 * row that arrives with a non-registrable-domain key or an out-of-range `level` must FAIL to parse,
 * not fall through a later comparison as "not restricted, therefore fine".
 */

describe('TrustDomainSchema', () => {
  it('accepts a lowercase registrable domain', () => {
    expect(TrustDomainSchema.parse('github.com')).toBe('github.com');
    expect(TrustDomainSchema.parse('sub.example.co.uk')).toBe('sub.example.co.uk');
  });

  it.each([
    ['', 'empty'],
    ['localhost', 'no dot / not registrable'],
    ['https://github.com/', 'a URL, not a domain'],
    ['GitHub.com', 'uppercase'],
    ['exam ple.com', 'a space'],
    ['a'.repeat(256) + '.com', 'over 255 chars'],
  ])('rejects %j (%s)', (value) => {
    expect(TrustDomainSchema.safeParse(value).success).toBe(false);
  });
});

describe('TrustProfileSetSchema', () => {
  it('accepts a well-formed { domain, level } pair', () => {
    expect(TrustProfileSetSchema.parse({ domain: 'example.com', level: 'restricted' })).toEqual({
      domain: 'example.com',
      level: 'restricted',
    });
  });

  it.each<[unknown, string]>([
    [{ domain: 'example.com', level: 'admin' }, 'level outside the enum'],
    [{ domain: 'not a domain', level: 'trusted' }, 'bad domain'],
    [{ domain: 'example.com' }, 'missing level'],
    [{ level: 'default' }, 'missing domain'],
  ])('rejects %j (%s)', (value) => {
    expect(TrustProfileSetSchema.safeParse(value).success).toBe(false);
  });
});
