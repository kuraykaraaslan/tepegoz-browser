import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Main-process wiring shim for the Unified Player (ext-video-player). It hands `createVideoPlayerHost`
 * three adapters. Pinned: `getPersisted` reads `PreferenceStore.videoPlayer`, `setPersisted` writes
 * it back under that key, and `isExtensionEnabled` consults the global gate with the player id.
 */

type Opts = {
  getPersisted: () => unknown;
  setPersisted: (v: unknown) => void;
  isExtensionEnabled: () => boolean;
};
const cap = vi.hoisted((): { opts?: Opts } => ({}));
vi.mock('@tepegoz/ext-video-player/host', () => ({
  VIDEO_PLAYER_EXTENSION_ID: 'ext-video-player',
  createVideoPlayerHost: (opts: Opts) => {
    cap.opts = opts;
    return { __host: 'video' };
  },
}));

const isExtensionEnabled = vi.hoisted(() => vi.fn(() => true));
vi.mock('@tepegoz/desktop-ipc', () => ({ isExtensionEnabled }));

const prefs = vi.hoisted(() => ({
  getAll: vi.fn(() => ({ videoPlayer: { pip: true }, extensions: [{ id: 'ext-video-player' }] })),
  update: vi.fn(),
}));
vi.mock('@tepegoz/preferences', () => ({ default: prefs }));

const { default: videoPlayerHost } = await import('./video-player-host.electron');
const opts = (): Opts => cap.opts!;

beforeEach(() => {
  vi.clearAllMocks();
  isExtensionEnabled.mockReturnValue(true);
  prefs.getAll.mockReturnValue({
    videoPlayer: { pip: true },
    extensions: [{ id: 'ext-video-player' }],
  });
});

describe('video-player-host wiring', () => {
  it('exports whatever the factory returned', () => {
    expect(videoPlayerHost).toEqual({ __host: 'video' });
  });

  it('getPersisted reads PreferenceStore.videoPlayer', () => {
    expect(opts().getPersisted()).toEqual({ pip: true });
  });

  it('setPersisted writes it back under the videoPlayer key', () => {
    opts().setPersisted({ pip: false });
    expect(prefs.update).toHaveBeenCalledWith({ videoPlayer: { pip: false } });
  });

  it('isExtensionEnabled consults the global gate with the player id', () => {
    isExtensionEnabled.mockReturnValue(false);
    expect(opts().isExtensionEnabled()).toBe(false);
    expect(isExtensionEnabled).toHaveBeenCalledWith(
      [{ id: 'ext-video-player' }],
      'ext-video-player',
    );
  });
});
