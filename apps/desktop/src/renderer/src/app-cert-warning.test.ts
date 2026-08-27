// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import type {
  CertificateErrorRequest,
  CertificateErrorResponse,
} from '@tepegoz/desktop-ipc';
import { useCertWarning } from './app-cert-warning';

/**
 * The TLS-cert warning controller. Main holds Chromium's callback open, so BOTH exits answer
 * explicitly — proceed sends `proceed: true`, refuse sends `proceed: false` — and neither is possible
 * with nothing pending.
 */

let push: ((r: CertificateErrorRequest | null) => void) | null;
let responses: CertificateErrorResponse[];

function req(id = 'r1'): CertificateErrorRequest {
  return {
    requestId: id,
    origin: 'https://bad.example',
    errorCode: 'net::ERR_CERT_AUTHORITY_INVALID',
    issuer: 'Sketchy CA',
    expiry: '2020-01-01T00:00:00Z',
  };
}

beforeEach(() => {
  push = null;
  responses = [];
  Object.defineProperty(window, 'tepegoz', {
    configurable: true,
    value: {
      onCertificateErrorRequest: (cb: (r: CertificateErrorRequest | null) => void) => {
        push = cb;
        return () => {
          push = null;
        };
      },
      respondCertificateError: (r: CertificateErrorResponse) => responses.push(r),
    },
  });
});
afterEach(cleanup);

describe('useCertWarning', () => {
  it('starts empty and subscribes', () => {
    const { result } = renderHook(() => useCertWarning());
    expect(result.current.request).toBeNull();
    expect(push).not.toBeNull();
  });

  it('proceed answers proceed:true and clears', () => {
    const { result } = renderHook(() => useCertWarning());
    act(() => push?.(req('a')));
    act(() => result.current.proceed());
    expect(responses).toEqual([{ requestId: 'a', proceed: true }]);
    expect(result.current.request).toBeNull();
  });

  it('refuse answers proceed:false and clears', () => {
    const { result } = renderHook(() => useCertWarning());
    act(() => push?.(req('a')));
    act(() => result.current.refuse());
    expect(responses).toEqual([{ requestId: 'a', proceed: false }]);
    expect(result.current.request).toBeNull();
  });

  it('proceed / refuse are no-ops with nothing pending', () => {
    const { result } = renderHook(() => useCertWarning());
    act(() => result.current.proceed());
    act(() => result.current.refuse());
    expect(responses).toEqual([]);
  });
});
