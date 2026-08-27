// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { useWindowMaximized } from './useWindowMaximized';

/** Tracks the window's maximized state: an initial read plus a live subscription, so the caption
 *  controls flip the moment the OS maximizes/restores the window. */

let push: (v: boolean) => void;
let unsub: ReturnType<typeof vi.fn>;
let initial: Promise<boolean>;

beforeEach(() => {
  push = () => undefined;
  unsub = vi.fn();
  initial = Promise.resolve(true);
  Object.defineProperty(window, 'tepegoz', {
    configurable: true,
    value: {
      isWindowMaximized: () => initial,
      onWindowMaximizedChange: (cb: (v: boolean) => void) => {
        push = cb;
        return unsub;
      },
    },
  });
});
afterEach(cleanup);

describe('useWindowMaximized', () => {
  it('starts false, adopts the initial read, then follows live changes', async () => {
    const { result } = renderHook(() => useWindowMaximized());
    expect(result.current).toBe(false);
    await waitFor(() => expect(result.current).toBe(true));
    act(() => push(false));
    expect(result.current).toBe(false);
  });

  it('unsubscribes on unmount', () => {
    const { unmount } = renderHook(() => useWindowMaximized());
    unmount();
    expect(unsub).toHaveBeenCalledTimes(1);
  });

  it('a rejected initial read leaves it at false', async () => {
    initial = Promise.reject(new Error('no bridge'));
    const { result } = renderHook(() => useWindowMaximized());
    await Promise.resolve();
    expect(result.current).toBe(false);
  });
});
