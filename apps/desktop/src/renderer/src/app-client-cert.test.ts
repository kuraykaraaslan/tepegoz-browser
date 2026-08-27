// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import type {
  ClientCertificateRequest,
  ClientCertificateResponse,
} from '@tepegoz/desktop-ipc';
import { useClientCert } from './app-client-cert';

/**
 * The client-certificate picker controller. Electron's default was to send the first cert in the OS
 * store with no prompt; this surface exists to make "send nothing" the safe default. Every exit
 * answers explicitly — `choose(i)` sends that index, `dismiss` sends `index: null`.
 */

let push: ((r: ClientCertificateRequest | null) => void) | null;
let responses: ClientCertificateResponse[];

function req(id = 'r1'): ClientCertificateRequest {
  return { requestId: id, origin: 'https://site.example', options: [] };
}

beforeEach(() => {
  push = null;
  responses = [];
  Object.defineProperty(window, 'tepegoz', {
    configurable: true,
    value: {
      onClientCertificateRequest: (cb: (r: ClientCertificateRequest | null) => void) => {
        push = cb;
        return () => {
          push = null;
        };
      },
      respondClientCertificate: (r: ClientCertificateResponse) => responses.push(r),
    },
  });
});
afterEach(cleanup);

describe('useClientCert', () => {
  it('starts empty and subscribes', () => {
    const { result } = renderHook(() => useClientCert());
    expect(result.current.request).toBeNull();
    expect(push).not.toBeNull();
  });

  it('choose sends the picked index and clears', () => {
    const { result } = renderHook(() => useClientCert());
    act(() => push?.(req('a')));
    act(() => result.current.choose(2));
    expect(responses).toEqual([{ requestId: 'a', index: 2 }]);
    expect(result.current.request).toBeNull();
  });

  it('dismiss sends index:null — "send nothing"', () => {
    const { result } = renderHook(() => useClientCert());
    act(() => push?.(req('a')));
    act(() => result.current.dismiss());
    expect(responses).toEqual([{ requestId: 'a', index: null }]);
    expect(result.current.request).toBeNull();
  });

  it('choose / dismiss are no-ops with nothing pending', () => {
    const { result } = renderHook(() => useClientCert());
    act(() => result.current.choose(0));
    act(() => result.current.dismiss());
    expect(responses).toEqual([]);
  });
});
