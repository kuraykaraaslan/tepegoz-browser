import { describe, expect, it } from 'vitest';
import type { TrustProfile } from '@tepegoz/shared-types';
import {
  TRUST_PROFILES_EXPORT_FORMAT,
  TRUST_PROFILES_EXPORT_VERSION,
  parseTrustProfilesImport,
  serializeTrustProfilesJson,
} from './trust-profile-export';

const profile = (over: Partial<TrustProfile> = {}): TrustProfile => ({
  id: '11111111-1111-4111-8111-111111111111',
  domain: 'example.com',
  level: 'trusted',
  deviceId: 'dev',
  updatedAt: 1_000,
  version: 1,
  tombstone: false,
  ...over,
});

describe('serializeTrustProfilesJson', () => {
  it('wraps the profiles in a versioned, format-marked envelope and ends with a newline', () => {
    const out = serializeTrustProfilesJson([profile()]);
    expect(out.endsWith('\n')).toBe(true);
    const parsed = JSON.parse(out) as { format: string; version: number; profiles: unknown[] };
    expect(parsed.format).toBe(TRUST_PROFILES_EXPORT_FORMAT);
    expect(parsed.version).toBe(TRUST_PROFILES_EXPORT_VERSION);
    expect(parsed.profiles).toHaveLength(1);
  });

  it('writes an empty profile list rather than omitting the key', () => {
    expect(JSON.parse(serializeTrustProfilesJson([]))).toMatchObject({ profiles: [] });
  });

  it('exports only domain + level — never id, deviceId, updatedAt, version, or tombstone', () => {
    const out = JSON.parse(serializeTrustProfilesJson([profile()])) as {
      profiles: Record<string, unknown>[];
    };
    const entry = out.profiles[0]!;
    expect(entry).toEqual({ domain: 'example.com', level: 'trusted' });
    expect(entry.id).toBeUndefined();
    expect(entry.deviceId).toBeUndefined();
    expect(entry.updatedAt).toBeUndefined();
    expect(entry.version).toBeUndefined();
    expect(entry.tombstone).toBeUndefined();
  });

  it('never exports a tombstoned (revoked) entry as if it were live', () => {
    const out = JSON.parse(
      serializeTrustProfilesJson([
        profile({ domain: 'live.example' }),
        profile({ domain: 'revoked.example', tombstone: true }),
      ]),
    ) as { profiles: { domain: string }[] };
    expect(out.profiles.map((p) => p.domain)).toEqual(['live.example']);
  });
});

describe('parseTrustProfilesImport', () => {
  it('round-trips what serializeTrustProfilesJson wrote', () => {
    const json = serializeTrustProfilesJson([
      profile({ domain: 'a.example' }),
      profile({ domain: 'b.example', level: 'restricted' }),
    ]);
    const { profiles, skipped } = parseTrustProfilesImport(json);
    expect(profiles).toEqual([
      { domain: 'a.example', level: 'trusted' },
      { domain: 'b.example', level: 'restricted' },
    ]);
    expect(skipped).toBe(0);
  });

  it('also accepts a bare JSON array of entries', () => {
    const { profiles, skipped } = parseTrustProfilesImport(
      JSON.stringify([{ domain: 'a.example', level: 'trusted' }]),
    );
    expect(profiles).toHaveLength(1);
    expect(skipped).toBe(0);
  });

  it('skips an entry the schema rejects (bad level), keeping the rest', () => {
    const good = { domain: 'a.example', level: 'trusted' };
    const bad = { domain: 'b.example', level: 'admin' };
    const json = JSON.stringify({
      format: TRUST_PROFILES_EXPORT_FORMAT,
      version: 1,
      profiles: [good, bad, { domain: 'c.example', level: 'restricted' }],
    });
    const { profiles, skipped } = parseTrustProfilesImport(json);
    expect(profiles.map((p) => p.domain)).toEqual(['a.example', 'c.example']);
    expect(skipped).toBe(1);
  });

  it('skips a non-registrable / unnormalized domain (e.g. with a scheme or uppercase)', () => {
    const json = JSON.stringify([
      { domain: 'https://a.example', level: 'trusted' },
      { domain: 'B.example', level: 'trusted' },
      { domain: 'nodot', level: 'trusted' },
      { domain: 'ok.example', level: 'trusted' },
    ]);
    const { profiles, skipped } = parseTrustProfilesImport(json);
    expect(profiles.map((p) => p.domain)).toEqual(['ok.example']);
    expect(skipped).toBe(3);
  });

  it('strips a smuggled id/deviceId/updatedAt/version/tombstone from an entry instead of honoring it', () => {
    const entry = {
      domain: 'a.example',
      level: 'trusted',
      id: 'not-a-real-uuid',
      deviceId: 'someone-elses-device',
      updatedAt: 0,
      version: 999,
      tombstone: true,
    };
    const { profiles, skipped } = parseTrustProfilesImport(JSON.stringify([entry]));
    expect(skipped).toBe(0);
    expect(profiles).toEqual([{ domain: 'a.example', level: 'trusted' }]);
  });

  it('throws a SyntaxError on text that is not JSON', () => {
    expect(() => parseTrustProfilesImport('not json {')).toThrow(SyntaxError);
  });

  it('throws a SyntaxError on JSON with no profiles list (object, number, null)', () => {
    expect(() => parseTrustProfilesImport('{"format":"tepegoz.trust-profiles"}')).toThrow(
      SyntaxError,
    );
    expect(() => parseTrustProfilesImport('42')).toThrow(SyntaxError);
    expect(() => parseTrustProfilesImport('null')).toThrow(SyntaxError);
  });

  it('returns an all-skipped result (not a throw) for a list of only bad entries', () => {
    const { profiles, skipped } = parseTrustProfilesImport(
      JSON.stringify([{ nope: 1 }, { nope: 2 }]),
    );
    expect(profiles).toEqual([]);
    expect(skipped).toBe(2);
  });
});

// The tighten-only invariant itself (`applyTrust`: a `deny` stays `deny`; destructive/financial risk
// and tainted args always keep their prompt) is pinned against an IMPORTED entry in
// `apps/desktop/src/main/security/trust-profile-host.electron.test.ts`, next to the existing coverage
// for a manually-set one — that file already composes `TrustProfileStore` with `PolicyKernel`, which is
// the exact pair `setTrustProfile`/`importTrustProfiles` compose in main, so the invariant is exercised
// through the real write path rather than re-implemented here against a schema this module doesn't own.
