import { useCallback, useEffect, useState } from 'react';
import type { BasicAuthRequest } from '@tepegoz/desktop-ipc';

export interface BasicAuthController {
  request: BasicAuthRequest | null;
  submit: (username: string, password: string) => void;
  cancel: () => void;
  /** Answer the current request with the credential named by `request.suggestedUsername`. The
   *  password never enters this hook — main re-derives and decrypts it itself. */
  useSaved: () => void;
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

  const useSaved = useCallback(() => {
    if (request === null) return;
    // Clears immediately like `submit`, without waiting for main to actually settle the challenge: if
    // the saved credential is wrong, Chromium reprompts with a fresh `authBasicRequest` push, which
    // reopens the dialog with new state rather than this one lingering on stale data.
    window.tepegoz.useSavedBasicAuth({ requestId: request.requestId });
    setRequest(null);
  }, [request]);

  return { request, submit, cancel, useSaved };
}
