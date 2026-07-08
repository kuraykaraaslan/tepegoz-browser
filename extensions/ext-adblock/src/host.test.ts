import { describe, expect, it } from 'vitest';
import {
  ADBLOCK_MANUAL_REFRESH_COOLDOWN_MS,
  createAdblockHost,
  type AdblockHostPorts,
} from './host';
import type { AdblockSettings } from './types';

function fakePorts(overrides?: {
  persisted?: Partial<AdblockSettings>;
  extensionEnabled?: boolean;
  now?: () => number;
}): AdblockHostPorts & { persisted: AdblockSettings } {
  const persisted: AdblockSettings = {
    enabled: true,
    blockingMode: 'ads-and-trackers',
    cosmeticFiltering: true,
    disabledOrigins: [],
    ...overrides?.persisted,
  };
  return {
    persisted,
    getPersisted: () => persisted,
    setPersisted: (settings) => {
      Object.assign(persisted, settings);
    },
    isExtensionEnabled: () => overrides?.extensionEnabled ?? true,
    ...(overrides?.now !== undefined ? { now: overrides.now } : {}),
  };
}

describe('createAdblockHost', () => {
  it('loads persisted settings and normalizes disabled origins', () => {
    const ports = fakePorts({
      persisted: {
        disabledOrigins: [
          'example.com',
          'https://example.com/path',
          'chrome://settings',
          'http://a.test/x',
        ],
      },
    });
    const host = createAdblockHost(ports);

    host.init();

    expect(host.get()).toEqual({
      enabled: true,
      blockingMode: 'ads-and-trackers',
      cosmeticFiltering: true,
      disabledOrigins: ['https://example.com', 'http://a.test'],
    });
  });

  it('pauses and resumes a site by origin', () => {
    const host = createAdblockHost(fakePorts());
    host.init();

    expect(host.isActiveForPage('https://news.test/article')).toBe(true);
    host.setSiteEnabled('https://news.test/article', false);

    expect(host.get().disabledOrigins).toEqual(['https://news.test']);
    expect(host.isActiveForPage('https://news.test/other')).toBe(false);

    host.setSiteEnabled('https://news.test/other', true);
    expect(host.get().disabledOrigins).toEqual([]);
    expect(host.isActiveForPage('https://news.test/other')).toBe(true);
  });

  it('fails open when the built-in extension is disabled', () => {
    const host = createAdblockHost(fakePorts({ extensionEnabled: false }));
    host.init();

    expect(host.isActiveForPage('https://example.com')).toBe(false);
  });

  it('keeps recent blocked requests capped newest first', () => {
    let now = 1_000;
    const host = createAdblockHost(fakePorts({ now: () => now++ }));
    host.init();

    for (let i = 0; i < 55; i += 1) {
      host.recordBlocked({ url: `https://ads.test/${i}`, resourceType: 'script' });
    }

    const state = host.state();
    expect(state.blockedThisSession).toBe(55);
    expect(state.recentBlocked).toHaveLength(50);
    expect(state.recentBlocked[0]?.url).toBe('https://ads.test/54');
    expect(state.recentBlocked.at(-1)?.url).toBe('https://ads.test/5');
  });

  it('enforces manual refresh cooldown without blocking state reads', () => {
    let now = 10_000;
    const host = createAdblockHost(fakePorts({ now: () => now }));
    host.init();

    expect(host.canRefreshManual()).toBe(true);
    host.markManualRefreshAttempt();
    expect(host.canRefreshManual()).toBe(false);
    expect(host.state().refreshAvailableAt).toBe(10_000 + ADBLOCK_MANUAL_REFRESH_COOLDOWN_MS);

    now += ADBLOCK_MANUAL_REFRESH_COOLDOWN_MS;
    expect(host.canRefreshManual()).toBe(true);
  });
});
