import { describe, expect, it } from 'vitest';
import { VIDEO_PLAYER_BOOTSTRAP } from './video-player-page-injector-script.electron';

/**
 * `VIDEO_PLAYER_BOOTSTRAP` — the small always-injected bootstrap that scans the page for eligible
 * videos and posts back over the `__tepegozVideoPlayerPost` binding. Pinned: it is a non-empty
 * self-invoking script that wires the binding + the enable/rescan hooks the CDP injector calls.
 */
describe('VIDEO_PLAYER_BOOTSTRAP', () => {
  it('is a self-invoking script wiring the binding + control hooks', () => {
    expect(typeof VIDEO_PLAYER_BOOTSTRAP).toBe('string');
    expect(VIDEO_PLAYER_BOOTSTRAP.length).toBeGreaterThan(200);
    expect(VIDEO_PLAYER_BOOTSTRAP).toContain('__tepegozVideoPlayerPost');
    expect(VIDEO_PLAYER_BOOTSTRAP).toContain('__tepegozVideoPlayerSetEnabled');
    expect(VIDEO_PLAYER_BOOTSTRAP.trimStart().startsWith('(')).toBe(true);
  });
});
