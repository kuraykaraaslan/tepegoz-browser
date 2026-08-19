import { describe, expect, it } from 'vitest';
import { SITE_DATA_KINDS } from '@tepegoz/shared-types';
import { clearsCredentialVault, planSiteClear } from './site-data';

describe('scoping a per-site clear', () => {
  it('scopes to the registrable domain, so subdomains of one site go together', () => {
    // What a person means by "this site" is example.com including its mail and www hosts.
    expect(planSiteClear('https://mail.example.com/inbox')?.site).toBe('example.com');
  });

  it('covers BOTH schemes — a site that moved to https still has cookies under the old origin', () => {
    const origins = planSiteClear('https://example.com/')?.origins ?? [];
    expect(origins).toContain('https://example.com');
    expect(origins).toContain('http://example.com');
  });

  it('emits no duplicate origins', () => {
    const origins = planSiteClear('https://example.com/')?.origins ?? [];
    expect(new Set(origins).size).toBe(origins.length);
  });

  it('REFUSES a URL with no site to scope to, rather than clearing something nearby', () => {
    // A bare public suffix, an unparseable string, or an IP literal has no "site" in the sense this
    // feature means. Clearing an approximation would be worse than doing nothing.
    expect(planSiteClear('not a url')).toBeNull();
    expect(planSiteClear('https://com/')).toBeNull();
    expect(planSiteClear('')).toBeNull();
  });

  it('clears every storage kind, not just cookies', () => {
    // "Forget this site" that leaves a service worker and an IndexedDB behind is not forgetting.
    expect(planSiteClear('https://example.com/')?.kinds).toEqual([...SITE_DATA_KINDS]);
    expect(SITE_DATA_KINDS).toContain('serviceworkers');
    expect(SITE_DATA_KINDS).toContain('indexdb');
  });
});

describe('warning before, not after', () => {
  it('warns that the user will be signed out', () => {
    const plan = planSiteClear('https://example.com/', { hasActiveSession: true });
    expect(plan?.warnings).toContain('signs_you_out');
  });

  it('warns that offline data will stop working', () => {
    const plan = planSiteClear('https://example.com/', { hasOfflineData: true });
    expect(plan?.warnings).toContain('has_offline_data');
  });

  it('warns that the vault still holds credentials for the site', () => {
    // A different act from deleting them — the point of the warning is that the two are not the same.
    const plan = planSiteClear('https://example.com/', { hasSavedCredentials: true });
    expect(plan?.warnings).toContain('holds_saved_credentials');
  });

  it('warns about nothing when there is nothing to warn about', () => {
    expect(planSiteClear('https://example.com/')?.warnings).toEqual([]);
  });
});

describe('the credential vault', () => {
  it('is NEVER in scope for a site clear', () => {
    // Its own predicate because this is the invariant most likely to be broken by someone helpfully
    // adding "and also clear saved passwords" to a Forget-this-site button.
    expect(clearsCredentialVault()).toBe(false);
  });
});
