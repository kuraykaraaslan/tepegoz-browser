import { describe, expect, it } from 'vitest';
import type { AgentEndpointToken } from '@tepegoz/shared-types';
import { tokenCovers, withinRateLimit } from './agent-endpoint-gate';

const NOW = 1_000_000;

const token = (over: Partial<AgentEndpointToken> = {}): AgentEndpointToken => ({
  id: 't1',
  allowedToolIds: ['browser_get_page'],
  allowedDangerClasses: ['read'],
  expiresAt: NOW + 10_000,
  ...over,
});

describe('tokenCovers — deny by default', () => {
  it('allows a call inside every bound', () => {
    const v = tokenCovers(
      token(),
      { toolId: 'browser_get_page', dangerClass: 'read' },
      { now: NOW },
    );
    expect(v).toEqual({ allowed: true });
  });

  it('denies an EXPIRED token', () => {
    const v = tokenCovers(
      token({ expiresAt: NOW - 1 }),
      { toolId: 'browser_get_page', dangerClass: 'read' },
      { now: NOW },
    );
    expect(v).toEqual({ allowed: false, reason: 'expired' });
  });

  it('denies a REVOKED token, even if otherwise valid', () => {
    const v = tokenCovers(
      token(),
      { toolId: 'browser_get_page', dangerClass: 'read' },
      { now: NOW, revoked: true },
    );
    expect(v).toEqual({ allowed: false, reason: 'revoked' });
  });

  it('denies a TOOL the token never listed', () => {
    const v = tokenCovers(
      token(),
      { toolId: 'browser_update_page', dangerClass: 'read' },
      { now: NOW },
    );
    expect(v).toEqual({ allowed: false, reason: 'tool_not_allowed' });
  });

  it('denies a DANGER CLASS the token never listed, even on an otherwise-allowed tool', () => {
    // The classic case: a tool declared "read" that reclassifies to state_changing on its real
    // arguments must not sail through just because the tool id was on the allow-list.
    const v = tokenCovers(
      token({ allowedToolIds: ['browser_get_page'], allowedDangerClasses: ['read'] }),
      { toolId: 'browser_get_page', dangerClass: 'state_changing' },
      { now: NOW },
    );
    expect(v).toEqual({ allowed: false, reason: 'danger_class_not_allowed' });
  });

  it('LOCKS OUT a sensitive site regardless of what the token would otherwise permit', () => {
    const wideOpen = token({
      allowedToolIds: ['browser_get_page'],
      allowedDangerClasses: ['read'],
    });
    const v = tokenCovers(
      wideOpen,
      {
        toolId: 'browser_get_page',
        dangerClass: 'read',
        targetUrl: 'https://www.chase.com/accounts',
      },
      { now: NOW },
    );
    expect(v).toEqual({ allowed: false, reason: 'sensitive_site_lockout' });
  });

  it('checks the sensitive-site lockout BEFORE the token’s own scope — the site refusal is the true cause', () => {
    const narrow = token({ allowedToolIds: [], allowedDangerClasses: ['read'] }); // would ALSO fail on tool
    const v = tokenCovers(
      narrow,
      { toolId: 'browser_get_page', dangerClass: 'read', targetUrl: 'https://www.chase.com/' },
      { now: NOW },
    );
    expect(v).toEqual({ allowed: false, reason: 'sensitive_site_lockout' });
  });

  it('does not apply the sensitive-site check to a call with no target at all', () => {
    const v = tokenCovers(
      token(),
      { toolId: 'browser_get_page', dangerClass: 'read' },
      { now: NOW },
    );
    expect(v.allowed).toBe(true);
  });

  it('allows an ordinary site with a target URL', () => {
    const v = tokenCovers(
      token(),
      { toolId: 'browser_get_page', dangerClass: 'read', targetUrl: 'https://example.com/' },
      { now: NOW },
    );
    expect(v).toEqual({ allowed: true });
  });
});

describe('withinRateLimit', () => {
  it('allows a call when under the limit', () => {
    expect(withinRateLimit(5, [NOW - 1000, NOW - 2000], NOW)).toBe(true);
  });

  it('refuses a call once the rolling window is at capacity', () => {
    const calls = [NOW - 1000, NOW - 2000, NOW - 3000];
    expect(withinRateLimit(3, calls, NOW)).toBe(false);
  });

  it('does not count calls OUTSIDE the 60s window', () => {
    const calls = [NOW - 61_000, NOW - 62_000]; // both older than the window
    expect(withinRateLimit(1, calls, NOW)).toBe(true);
  });

  it('counts a call exactly at the window boundary as outside it, and one just inside as counted', () => {
    expect(withinRateLimit(1, [NOW - 60_000], NOW)).toBe(true); // exactly 60s old: outside
    expect(withinRateLimit(1, [NOW - 59_999], NOW)).toBe(false); // just inside: counts, hits the cap
  });
});
