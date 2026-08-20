import { describe, expect, it } from 'vitest';
import { PackageManifestSchema } from './supply-chain';

const manifest = (over: Record<string, unknown> = {}) => ({
  id: 'acme-invoice-skill',
  version: '1.0.0',
  declaredCapabilities: ['browser_get_page'],
  signatureVerified: true,
  sbomVerified: true,
  attestationVerified: true,
  ...over,
});

describe('the PackageManifest shape', () => {
  it('parses a fully-verified manifest', () => {
    expect(PackageManifestSchema.safeParse(manifest()).success).toBe(true);
  });

  it('accepts an EMPTY declaredCapabilities — a package that needs nothing declares that explicitly', () => {
    expect(PackageManifestSchema.safeParse(manifest({ declaredCapabilities: [] })).success).toBe(true);
  });

  it('accepts every verification flag as false — an unsigned, unattested package is still a valid manifest to reason about', () => {
    const r = PackageManifestSchema.safeParse(
      manifest({ signatureVerified: false, sbomVerified: false, attestationVerified: false }),
    );
    expect(r.success).toBe(true);
  });

  it('refuses a manifest missing an id or version', () => {
    expect(PackageManifestSchema.safeParse(manifest({ id: '' })).success).toBe(false);
    expect(PackageManifestSchema.safeParse(manifest({ version: '' })).success).toBe(false);
  });
});
