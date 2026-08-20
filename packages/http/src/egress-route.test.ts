import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '@tepegoz/libs';
import {
  currentEgressRoute,
  resetEgressForTests,
  resolveEgressAgents,
  setEgressPolicy,
  setTunnelAgentFactory,
} from './egress-route';

afterEach(() => {
  resetEgressForTests();
});

describe('the default', () => {
  it('is Direct — app-issued HTTP behaves exactly as it did before Phase 5', () => {
    expect(currentEgressRoute()).toEqual({ mode: 'direct' });
    expect(resolveEgressAgents()).toBeNull();
  });
});

describe('when a tunnel is in force', () => {
  it('attaches the installed transport', () => {
    const agents = { httpAgent: 'http', httpsAgent: 'https' };
    setEgressPolicy(() => ({ mode: 'tunnel', socksPort: 1080 }));
    const factory = vi.fn(() => agents);
    setTunnelAgentFactory(factory);

    expect(resolveEgressAgents()).toBe(agents);
    expect(factory).toHaveBeenCalledWith(1080);
  });

  it('REFUSES the request when no transport can honour it — never a silent downgrade to Direct', () => {
    // This is the whole point. Sending it direct "because we could not tunnel it" is the leak, and it is
    // worse here than in a tab: there is no address bar to show the user what just happened.
    setEgressPolicy(() => ({ mode: 'tunnel', socksPort: 1080 }));
    expect(() => resolveEgressAgents()).toThrow(AppError);
    expect(() => resolveEgressAgents()).toThrow(/no tunnel transport is installed/);
  });

  it('refuses when the policy itself throws — silence is not evidence that Direct is safe', () => {
    setEgressPolicy(() => {
      throw new Error('binding store unavailable');
    });
    expect(() => resolveEgressAgents()).toThrow(/tunnel is in force/);
  });
});

describe('changing the binding', () => {
  it('is read per request, so a long-lived client follows a General change', () => {
    let tunneled = false;
    const agents = { httpAgent: 'http', httpsAgent: 'https' };
    setEgressPolicy(() => (tunneled ? { mode: 'tunnel', socksPort: 9050 } : { mode: 'direct' }));
    setTunnelAgentFactory(() => agents);

    expect(resolveEgressAgents()).toBeNull();
    tunneled = true;
    expect(resolveEgressAgents()).toBe(agents);
    tunneled = false;
    expect(resolveEgressAgents()).toBeNull();
  });

  it('uninstalling the transport makes a tunneled route fail rather than fall back', () => {
    setEgressPolicy(() => ({ mode: 'tunnel', socksPort: 9050 }));
    setTunnelAgentFactory(() => ({ httpAgent: 'a', httpsAgent: 'b' }));
    expect(resolveEgressAgents()).not.toBeNull();
    setTunnelAgentFactory(null);
    expect(() => resolveEgressAgents()).toThrow(AppError);
  });
});
