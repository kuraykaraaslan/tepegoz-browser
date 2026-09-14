import { describe, expect, it } from 'vitest';
import { isMutedNow } from './mute';

describe('isMutedNow', () => {
  it('is true when the forever flag is set, regardless of mutedUntil', () => {
    expect(isMutedNow({ muted: true, mutedUntil: null }, 1000)).toBe(true);
  });

  it('is true while an unexpired timed mute is active', () => {
    expect(isMutedNow({ muted: false, mutedUntil: 2000 }, 1000)).toBe(true);
  });

  it('is false once a timed mute has expired — no cleanup step needed, this check does it', () => {
    expect(isMutedNow({ muted: false, mutedUntil: 500 }, 1000)).toBe(false);
  });

  it('is false with neither flag set', () => {
    expect(isMutedNow({ muted: false, mutedUntil: null }, 1000)).toBe(false);
  });
});
