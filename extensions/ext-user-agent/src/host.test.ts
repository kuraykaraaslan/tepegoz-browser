import { describe, it, expect, vi } from 'vitest';
import { createUserAgentHost, type UserAgentPorts } from './host';

const DEFAULT_UA = 'Mozilla/5.0 (DefaultBrowser)';

function fakePorts(
  overrides?: Partial<UserAgentPorts> & { persisted?: string | null; enabled?: boolean },
) {
  const state = { persisted: overrides?.persisted ?? null, enabled: overrides?.enabled ?? true };
  const ports: UserAgentPorts & { session: string[]; tabs: string[] } = {
    getPersisted: () => state.persisted,
    setPersisted: (ua) => {
      state.persisted = ua;
    },
    defaultUserAgent: () => DEFAULT_UA,
    applyToSession: (ua) => {
      ports.session.push(ua);
    },
    applyToTabs: (ua) => {
      ports.tabs.push(ua);
    },
    isEnabled: () => state.enabled,
    session: [],
    tabs: [],
    ...overrides,
  };
  return ports;
}

describe('createUserAgentHost', () => {
  it('init applies the persisted override to the session when enabled', () => {
    const ports = fakePorts({ persisted: 'CustomUA/1.0' });
    const host = createUserAgentHost(ports);
    host.init();
    expect(ports.session).toEqual(['CustomUA/1.0']);
    expect(host.get()).toBe('CustomUA/1.0');
  });

  it('init applies the browser default when the extension is disabled, ignoring a stale override', () => {
    const ports = fakePorts({ persisted: 'CustomUA/1.0', enabled: false });
    const host = createUserAgentHost(ports);
    host.init();
    expect(ports.session).toEqual([DEFAULT_UA]);
  });

  it('set persists + applies to session and tabs, normalizing blank to null (default)', () => {
    const ports = fakePorts();
    const host = createUserAgentHost(ports);
    host.set('CustomUA/1.0');
    expect(host.get()).toBe('CustomUA/1.0');
    expect(ports.session).toEqual(['CustomUA/1.0']);
    expect(ports.tabs).toEqual(['CustomUA/1.0']);

    host.set('   '); // blank → reset to default
    expect(host.get()).toBeNull();
    expect(ports.session.at(-1)).toBe(DEFAULT_UA);
    expect(ports.tabs.at(-1)).toBe(DEFAULT_UA);
  });

  it('set is a no-op when the extension is disabled', () => {
    const setPersisted = vi.fn();
    const ports = fakePorts({ enabled: false, setPersisted });
    const host = createUserAgentHost(ports);
    const result = host.set('CustomUA/1.0');
    expect(result).toBeNull();
    expect(setPersisted).not.toHaveBeenCalled();
    expect(ports.session).toEqual([]);
    expect(ports.tabs).toEqual([]);
  });
});
