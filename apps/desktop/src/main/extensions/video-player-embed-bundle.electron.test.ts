import { describe, expect, it } from 'vitest';
import {
  VIDEO_PLAYER_EMBED_JS,
  VIDEO_PLAYER_EMBED_VERSION,
} from './video-player-embed-bundle.electron';

/**
 * `video-player-embed-bundle` — the auto-generated kui-player embed IIFE + its version tag. Pinned:
 * the bundle is a non-empty string and the version is a semver-ish tag (both are what the injector
 * ships into a page and reports).
 */
describe('video-player embed bundle', () => {
  it('exposes a non-empty embed script and a version tag', () => {
    expect(typeof VIDEO_PLAYER_EMBED_JS).toBe('string');
    expect(VIDEO_PLAYER_EMBED_JS.length).toBeGreaterThan(100);
    expect(VIDEO_PLAYER_EMBED_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
