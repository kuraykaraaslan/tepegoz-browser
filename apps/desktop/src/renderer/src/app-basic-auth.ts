import { useCallback, useEffect, useState } from 'react';
import type { BasicAuthRequest } from '@tepegoz/desktop-ipc';

export interface BasicAuthController {
  request: BasicAuthRequest | null;
  submit: (username: string, password: string) => void;
  cancel: () => void;
}

/**
 * Pending HTTP 401/407 challenge for the chrome (Phase 2c). Main serializes challenges, so at most one
 * is ever outstanding; a new one replaces whatever is on screen.
 *
 * The credentials live only in the prompt component's own state and pass straight back to main. This
 * hook never holds them, which is why `submit` takes them as arguments rather than owning the fields.
 */
export function useBasicAuth(): BasicAuthController {
  const [request, setRequest] = useState<BasicAuthRequest | null>(null);

  useEffect(() => window.tepegoz.onBasicAuthRequest(setRequest), []);

  const submit = useCallback(
    (username: string, password: string) => {
      if (request === null) return;
      window.tepegoz.respondBasicAuth({
        requestId: request.requestId,
        username,
        password,
        cancelled: false,
      });
      setRequest(null);
    },
    [request],
  );

  const cancel = useCallback(() => {
    if (request === null) return;
    // Answer explicitly rather than just closing: main is holding Chromium's callback open, and an
    // unanswered challenge would leave the request hanging until the prompt times out.
    window.tepegoz.respondBasicAuth({
      requestId: request.requestId,
      username: '',
      password: '',
      cancelled: true,
    });
    setRequest(null);
  }, [request]);

  return { request, submit, cancel };
}
