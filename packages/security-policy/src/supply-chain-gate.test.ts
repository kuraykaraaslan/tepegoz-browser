import { describe, expect, it } from 'vitest';
import type { PackageManifest } from '@tepegoz/shared-types';
import {
  declaredVsActualMismatch,
  declaredWithinRequestedScope,
  evaluateSupplyChain,
} from './supply-chain-gate';

const manifest = (over: Partial<PackageManifest> = {}): PackageManifest => ({
  id: 'acme-invoice-skill',
  version: '1.0.0',
  declaredCapabilities: ['browser_get_page'],
  signatureVerified: true,
  sbomVerified: true,
  attestationVerified: true,
  ...over,
});

describe('evaluateSupplyChain — three tiers', () => {
  it('earns the top tier with signature + SBOM + attestation all verified', () => {
    expect(evaluateSupplyChain(manifest())).toEqual({ tier: 'attested', reasons: [] });
  });

  it('an UNSIGNED package is quarantined, never blocked outright', () => {
    // Refusing an unsigned package entirely would foreclose the "unverified but honest" long tail a
    // registry needs to be useful at all — quarantine (sandboxed, no credentials) is the deliberate
    // middle ground, not a full block.
    const v = evaluateSupplyChain(manifest({ signatureVerified: false }));
    expect(v).toEqual({ tier: 'quarantined', reasons: ['unsigned'] });
  });

  it('unsigned wins over every other flag — a package cannot buy back trust with a fake SBOM alone', () => {
    const v = evaluateSupplyChain(
      manifest({ signatureVerified: false, sbomVerified: true, attestationVerified: true }),
    );
    expect(v.tier).toBe('quarantined');
  });

  it('signed but missing SBOM sits in signed_basic, not attested', () => {
    const v = evaluateSupplyChain(manifest({ sbomVerified: false }));
    expect(v).toEqual({ tier: 'signed_basic', reasons: ['sbom_unverified'] });
  });

  it('signed but missing attestation sits in signed_basic', () => {
    const v = evaluateSupplyChain(manifest({ attestationVerified: false }));
    expect(v).toEqual({ tier: 'signed_basic', reasons: ['attestation_unverified'] });
  });

  it('collects BOTH missing-SBOM and missing-attestation reasons at once', () => {
    const v = evaluateSupplyChain(manifest({ sbomVerified: false, attestationVerified: false }));
    expect(v).toEqual({
      tier: 'signed_basic',
      reasons: ['sbom_unverified', 'attestation_unverified'],
    });
  });
});

describe('declaredWithinRequestedScope', () => {
  it('passes when everything declared was actually shown to the user', () => {
    const v = declaredWithinRequestedScope(
      ['browser_get_page', 'browser_update_page'],
      ['browser_get_page', 'browser_update_page', 'file_read_item'],
    );
    expect(v).toEqual({ withinScope: true });
  });

  it('REJECTS a package asking for more than what was disclosed at scope review', () => {
    const v = declaredWithinRequestedScope(
      ['browser_get_page', 'credential_update_field'],
      ['browser_get_page'],
    );
    expect(v).toEqual({ withinScope: false, undisclosed: ['credential_update_field'] });
  });

  it('passes vacuously when a package declares nothing', () => {
    expect(declaredWithinRequestedScope([], ['browser_get_page'])).toEqual({ withinScope: true });
  });

  it('reports EVERY undisclosed capability, not just the first', () => {
    const v = declaredWithinRequestedScope(['a', 'b', 'c'], ['a']);
    expect(v).toEqual({ withinScope: false, undisclosed: ['b', 'c'] });
  });
});

describe('declaredVsActualMismatch — the first-run check', () => {
  it('finds nothing when the package only ever calls what it declared', () => {
    expect(declaredVsActualMismatch(['browser_get_page'], ['browser_get_page'])).toEqual([]);
  });

  it('catches a tool the package invoked but never declared — the mismatch that blocks/HITLs', () => {
    const mismatch = declaredVsActualMismatch(
      ['browser_get_page'],
      ['browser_get_page', 'file_delete_item'],
    );
    expect(mismatch).toEqual(['file_delete_item']);
  });

  it('does not flag a declared capability the package simply never happened to use', () => {
    // Declaring more than you use is over-cautious, not dishonest — only USING more than declared is
    // the mismatch this function exists to catch.
    expect(
      declaredVsActualMismatch(['browser_get_page', 'file_delete_item'], ['browser_get_page']),
    ).toEqual([]);
  });

  it('deduplicates a repeatedly-invoked undeclared tool into one finding', () => {
    const mismatch = declaredVsActualMismatch(
      [],
      ['file_delete_item', 'file_delete_item', 'file_delete_item'],
    );
    expect(mismatch).toEqual(['file_delete_item']);
  });
});
