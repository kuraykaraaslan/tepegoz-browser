import { describe, expect, it } from 'vitest';
import { isQuitting, markQuitting } from './quit-state';

/**
 * The one flag that lets the window `close` interceptor tell "a real quit" from "the X was clicked
 * with close-to-tray on". Starts false, `markQuitting` is a one-way idempotent latch.
 */
describe('quit-state', () => {
  it('starts not-quitting', () => {
    expect(isQuitting()).toBe(false);
  });

  it('latches on markQuitting and stays latched (idempotent, one-way)', () => {
    markQuitting();
    expect(isQuitting()).toBe(true);
    markQuitting();
    expect(isQuitting()).toBe(true);
  });
});
