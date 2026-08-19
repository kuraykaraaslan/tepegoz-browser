import { describe, expect, it } from 'vitest';
import type { AdaptorConnection } from '@tepegoz/shared-types';
import { routeExecution } from './execution-router';

const connected = (over: Partial<AdaptorConnection> = {}): AdaptorConnection => ({
  id: 'google',
  label: 'Google',
  kind: 'oauth_service',
  provider: 'google',
  state: 'connected',
  authKind: 'oauth',
  permissions: [{ capability: 'mail', scopes: ['gmail.send'], state: 'connected' }],
  auditRequired: false,
  toolCount: 3,
  ...over,
});

const req = (over: Record<string, unknown> = {}) => ({
  capability: 'mail' as const,
  apiRisk: 'state_changing' as const,
  adaptors: [connected()],
  browserFallbackAvailable: true,
  ...over,
});

describe('choosing a backend', () => {
  it('prefers the official API when a connected adaptor serves the capability', () => {
    const d = routeExecution(req());
    expect(d.backend).toBe('api');
    expect(d.adaptorId).toBe('google');
  });

  it('ignores an adaptor that is not connected', () => {
    const d = routeExecution(req({ adaptors: [connected({ state: 'revoked' })] }));
    expect(d.backend).toBe('browser');
  });

  it('ignores an adaptor whose PERMISSION for this capability is not connected', () => {
    // The connection being live says nothing about this particular scope having been granted.
    const half = connected({
      permissions: [{ capability: 'mail', scopes: [], state: 'revoked' }],
    });
    expect(routeExecution(req({ adaptors: [half] })).backend).toBe('browser');
  });

  it('ignores an adaptor that serves a DIFFERENT capability', () => {
    const drive = connected({
      permissions: [{ capability: 'drive', scopes: ['drive.file'], state: 'connected' }],
    });
    expect(routeExecution(req({ adaptors: [drive] })).backend).toBe('browser');
  });

  it('REFUSES rather than guessing when there is neither an adaptor nor a page', () => {
    // "No connected adaptor and no logged-in page" is information the user can act on. Guessing at a
    // page and failing halfway is not.
    const d = routeExecution(req({ adaptors: [], browserFallbackAvailable: false }));
    expect(d.backend).toBe('none');
    expect(d.reason).toBe('no_backend_available');
  });
});

describe('falling back RE-CLASSIFIES the risk', () => {
  it('escalates state_changing to destructive on the browser path', () => {
    // The same task — "send this email" — is a scoped call through an API and an unscoped one through a
    // session that can also read every message and change the password. Not two ways of doing one thing.
    const d = routeExecution(req({ adaptors: [] }));
    expect(d.backend).toBe('browser');
    expect(d.effectiveRisk).toBe('destructive');
    expect(d.escalated).toBe(true);
  });

  it('escalates a READ, because a browser read is not the read the API meant', () => {
    // Navigating a logged-in session marks mail read, advances counters, and runs whatever the page does
    // on load. Calling that a read would be taking the API's word for a different act.
    const d = routeExecution(req({ apiRisk: 'read', adaptors: [] }));
    expect(d.effectiveRisk).toBe('state_changing');
    expect(d.escalated).toBe(true);
  });

  it('does not pretend to escalate what is already at the ceiling', () => {
    for (const risk of ['destructive', 'financial'] as const) {
      const d = routeExecution(req({ apiRisk: risk, adaptors: [] }));
      expect(d.effectiveRisk, `risk=${risk}`).toBe(risk);
      expect(d.escalated).toBe(false);
    }
  });

  it('never escalates on the API path', () => {
    const d = routeExecution(req());
    expect(d.effectiveRisk).toBe('state_changing');
    expect(d.escalated).toBe(false);
  });
});

describe('the decision is journallable', () => {
  it('names WHICH backend kind served it, not just that one did', () => {
    expect(routeExecution(req()).reason).toBe('api_backend_oauth_service');
    expect(routeExecution(req({ adaptors: [] })).reason).toBe('browser_fallback_mail');
  });

  it('is deterministic — the same request routes the same way every time', () => {
    // No model, no clock, no network: a routing decision the user cannot reproduce is one nobody can
    // audit after the fact.
    const a = routeExecution(req());
    const b = routeExecution(req());
    expect(a).toEqual(b);
  });
});
