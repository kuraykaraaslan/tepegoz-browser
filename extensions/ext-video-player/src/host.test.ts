import { describe, expect, it } from 'vitest';
import {
  createVideoPlayerHost,
  DEFAULT_VIDEO_PLAYER_SETTINGS,
  type VideoPlayerHostPorts,
} from './host';
import type { VideoPlayerSettings } from './types';

function fakePorts(overrides?: {
  persisted?: Partial<VideoPlayerSettings>;
  extensionEnabled?: boolean;
}): VideoPlayerHostPorts & { persisted: VideoPlayerSettings } {
  const persisted: VideoPlayerSettings = {
    ...DEFAULT_VIDEO_PLAYER_SETTINGS,
    ...overrides?.persisted,
  };
  return {
    persisted,
    getPersisted: () => persisted,
    setPersisted: (settings) => {
      Object.assign(persisted, settings);
    },
    isExtensionEnabled: () => overrides?.extensionEnabled ?? true,
  };
}

describe('createVideoPlayerHost', () => {
  it('loads persisted settings, clamps speed, and normalizes disabled origins', () => {
    const host = createVideoPlayerHost(
      fakePorts({
        persisted: {
          defaultSpeed: 99,
          disabledOrigins: ['example.com', 'https://example.com/path', 'chrome://x', 'http://a.test/y'],
        },
      }),
    );
    host.init();

    const settings = host.get();
    expect(settings.defaultSpeed).toBe(4);
    expect(settings.disabledOrigins).toEqual(['https://example.com', 'http://a.test']);
  });

  it('pauses and resumes a site by origin', () => {
    const host = createVideoPlayerHost(fakePorts());
    host.init();

    expect(host.isActiveForPage('https://vid.test/watch')).toBe(true);
    host.setSiteEnabled('https://vid.test/watch', false);

    expect(host.get().disabledOrigins).toEqual(['https://vid.test']);
    expect(host.isActiveForPage('https://vid.test/other')).toBe(false);

    host.setSiteEnabled('https://vid.test/other', true);
    expect(host.get().disabledOrigins).toEqual([]);
    expect(host.isActiveForPage('https://vid.test/other')).toBe(true);
  });

  it('fails safe when the built-in extension is disabled', () => {
    const host = createVideoPlayerHost(fakePorts({ extensionEnabled: false }));
    host.init();
    expect(host.isActiveForPage('https://example.com')).toBe(false);
  });

  it('is inactive on non-http(s) pages', () => {
    const host = createVideoPlayerHost(fakePorts());
    host.init();
    expect(host.isActiveForPage('tepegoz://newtab')).toBe(false);
  });

  it('resolves skin options, mapping auto/light/dark theme', () => {
    const host = createVideoPlayerHost(fakePorts({ persisted: { theme: 'auto', defaultSpeed: 1.5 } }));
    host.init();
    expect(host.skinOptions(null)).toEqual({
      defaultSpeed: 1.5,
      autoHideControls: true,
      enableKeyboard: true,
      theme: 'dark',
      scale: 1,
    });

    host.update({ theme: 'light' });
    expect(host.skinOptions(null).theme).toBe('light');
  });

  it('defaults YouTube to a 1.4x scale and other sites to 1x', () => {
    const host = createVideoPlayerHost(fakePorts());
    host.init();
    expect(host.skinOptions('https://www.youtube.com').scale).toBe(1.4);
    expect(host.skinOptions('https://example.com').scale).toBe(1);
    expect(host.skinOptions(null).scale).toBe(1);
  });

  it('sanitizes siteScales: drops bad origins, clamps out-of-range values', () => {
    const host = createVideoPlayerHost(
      fakePorts({
        persisted: {
          siteScales: {
            'https://example.com': 5,
            'https://a.test': 0.1,
            'chrome://x': 2,
          },
        },
      }),
    );
    host.init();

    expect(host.skinOptions('https://example.com').scale).toBe(3);
    expect(host.skinOptions('https://a.test').scale).toBe(0.5);
    expect(host.get().siteScales['chrome://x']).toBeUndefined();
  });

  it('persists a per-site scale via update()', () => {
    const host = createVideoPlayerHost(fakePorts());
    host.init();

    host.update({ siteScales: { ...host.get().siteScales, 'https://vid.test': 1.75 } });
    expect(host.skinOptions('https://vid.test').scale).toBe(1.75);
    // YouTube's seeded default survives an unrelated patch.
    expect(host.skinOptions('https://www.youtube.com').scale).toBe(1.4);
  });
});
