import { useCallback, useEffect, useState } from 'react';
import type { CertificateErrorRequest } from '@tepegoz/desktop-ipc';

export interface CertWarningController {
  request: CertificateErrorRequest | null;
  proceed: () => void;
  refuse: () => void;
}

/**
 * Pending TLS certificate warning for the chrome (Phase 2c).
 *
 * Both answers are sent explicitly. Main is holding Chromium's callback open, so closing the dialog
 * without answering would leave the connection hanging until the broker's timeout — and the timeout
 * refuses anyway, so silence is never the faster path to "yes".
 */
export function useCertWarning(): CertWarningController {
  const [request, setRequest] = useState<CertificateErrorRequest | null>(null);

  useEffect(() => window.tepegoz.onCertificateErrorRequest(setRequest), []);

  const answer = useCallback(
    (proceed: boolean) => {
      if (request === null) return;
      window.tepegoz.respondCertificateError({ requestId: request.requestId, proceed });
      setRequest(null);
    },
    [request],
  );

  return {
    request,
    proceed: useCallback(() => {
      answer(true);
    }, [answer]),
    refuse: useCallback(() => {
      answer(false);
    }, [answer]),
  };
}
