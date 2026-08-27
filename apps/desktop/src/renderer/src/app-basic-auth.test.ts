// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import type { BasicAuthRequest, BasicAuthResponse } from '@tepegoz/desktop-ipc';
import { useBasicAuth } from './app-basic-auth';

/**
 * The HTTP 401/407 prompt controller. Main holds Chromium's auth callback open, so every path MUST
 * answer it — `cancel` sends an explicit `cancelled: true`, never just closes. The hook never holds
 * the credentials (that is the prompt component's state); `submit` takes them as arguments.
 */

let push: ((r: BasicAuthRequest | null) => void) | null;
let responses: BasicAuthResponse[];

function req(id = 'r1'): BasicAuthRequest {
  return { requestId: id, origin: 'https://example.com', realm: 'restricted', isProxy: false };
}

beforeEach(() => {
  push = null;
  responses = [];
  Object.defineProperty(window, 'tepegoz', {
    configurable: true,
    value: {
      onBasicAuthRequest: (cb: (r: BasicAuthRequest | null) => void) => {
        push = cb;
        return () => {
          push = null;
        };
      },
      respondBasicAuth: (r: BasicAuthResponse) => responses.push(r),
    },
  });
});
afterEach(cleanup);

describe('useBasicAuth', () => {
  it('starts with no request and subscribes on mount', () => {
    const { result } = renderHook(() => useBasicAuth());
    expect(result.current.request).toBeNull();
    expect(push).not.toBeNull();
  });

  it('shows a pushed challenge, and a newer one replaces it', () => {
    const { result } = renderHook(() => useBasicAuth());
    act(() => push?.(req('a')));
    expect(result.current.request?.requestId).toBe('a');
    act(() => push?.(req('b')));
    expect(result.current.request?.requestId).toBe('b');
  });

  it('submit answers with the credentials and clears the prompt', () => {
    const { result } = renderHook(() => useBasicAuth());
    act(() => push?.(req('a')));
    act(() => result.current.submit('neo', 'trinity'));
    expect(responses).toEqual([
      { requestId: 'a', username: 'neo', password: 'trinity', cancelled: false },
    ]);
    expect(result.current.request).toBeNull();
  });

  it('cancel answers explicitly with cancelled:true and empty creds', () => {
    const { result } = renderHook(() => useBasicAuth());
    act(() => push?.(req('a')));
    act(() => result.current.cancel());
    expect(responses).toEqual([
      { requestId: 'a', username: '', password: '', cancelled: true },
    ]);
    expect(result.current.request).toBeNull();
  });

  it('submit / cancel are no-ops when nothing is pending', () => {
    const { result } = renderHook(() => useBasicAuth());
    act(() => result.current.submit('x', 'y'));
    act(() => result.current.cancel());
    expect(responses).toEqual([]);
  });
});
