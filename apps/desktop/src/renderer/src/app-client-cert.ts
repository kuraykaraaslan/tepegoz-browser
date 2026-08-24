import { useCallback, useEffect, useState } from 'react';
import type { ClientCertificateRequest } from '@tepegoz/desktop-ipc';

export interface ClientCertController {
  request: ClientCertificateRequest | null;
  choose: (index: number | null) => void;
  /** Dismissing the prompt is an answer, and the answer is "send nothing". */
  dismiss: () => void;
}

/**
 * Pending client-certificate request for the chrome.
 *
 * Main is holding Chromium's callback open, so every exit path answers explicitly. Silence is not the
 * faster route to "send it": the broker's timeout sends nothing, and so does dismissal here. That is
 * the whole point of the surface — Electron's default was to send the first certificate in the store
 * with no prompt at all.
 */
export function useClientCert(): ClientCertController {
  const [request, setRequest] = useState<ClientCertificateRequest | null>(null);

  useEffect(() => window.tepegoz.onClientCertificateRequest(setRequest), []);

  const choose = useCallback(
    (index: number | null) => {
      if (request === null) return;
      window.tepegoz.respondClientCertificate({ requestId: request.requestId, index });
      setRequest(null);
    },
    [request],
  );

  return {
    request,
    choose,
    dismiss: useCallback(() => {
      choose(null);
    }, [choose]),
  };
}
