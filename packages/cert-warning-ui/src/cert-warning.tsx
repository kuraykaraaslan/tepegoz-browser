import { useT } from '@tepegoz/i18n/react';
import { certWarningDict } from './i18n';

export interface CertWarningProps {
  origin: string;
  /** Chromium's error code, e.g. `net::ERR_CERT_AUTHORITY_INVALID`. Display-only. */
  errorCode: string;
  /** Certificate issuer. Attacker-controlled text — shown as evidence, never as app copy. */
  issuer: string;
  /** ISO-8601 expiry of the offered certificate. */
  expiry: string;
  onBack: () => void;
  onProceed: () => void;
}

/**
 * `@tepegoz/cert-warning-ui` — the TLS certificate warning (Phase 2c). Presentational and
 * Electron-free; the decision leaves through the callbacks.
 *
 * Shaped to make "go back" the easy path and "continue" the deliberate one. The safe action is the
 * primary button and comes first; the risk is stated as a consequence ("someone could be reading what
 * you send") rather than as a category ("invalid certificate"), because the second tells a
 * non-specialist nothing about what they are agreeing to.
 *
 * Certificate details are shown as labelled evidence, deliberately subordinate: issuer strings are
 * chosen by whoever presented the certificate.
 *
 * Sensitive sites never reach this component — main hard-blocks them without offering a choice.
 */
export function CertWarning({
  origin,
  errorCode,
  issuer,
  expiry,
  onBack,
  onProceed,
}: CertWarningProps) {
  const t = useT(certWarningDict);

  return (
    <div className="flex w-[26rem] flex-col gap-3 p-5">
      <h2 className="text-base font-semibold text-error">{t.title}</h2>
      <p className="text-sm text-text-secondary">{t.intro}</p>
      <p className="break-all text-sm font-medium text-text-primary">{origin}</p>
      <p className="text-sm text-text-primary">{t.risk}</p>

      <dl className="flex flex-col gap-1 rounded-md bg-surface-sunken p-3 text-xs text-text-secondary">
        <div className="flex gap-2">
          <dt className="shrink-0">{t.errorCode}</dt>
          <dd className="break-all font-mono text-text-primary">{errorCode}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="shrink-0">{t.issuer}</dt>
          <dd className="break-all text-text-primary">{issuer}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="shrink-0">{t.expiry}</dt>
          <dd className="break-all text-text-primary">{expiry}</dd>
        </div>
      </dl>

      <div className="flex flex-col gap-2 pt-1">
        <button
          type="button"
          autoFocus
          onClick={onBack}
          className="rounded-md bg-primary px-3 py-2 text-sm text-primary-fg hover:bg-primary-hover"
        >
          {t.back}
        </button>
        <button
          type="button"
          onClick={onProceed}
          className="rounded-md px-3 py-1.5 text-xs text-text-secondary hover:bg-surface-overlay"
        >
          {t.proceed}
        </button>
        <p className="text-center text-xs text-text-disabled">{t.proceedNote}</p>
      </div>
    </div>
  );
}
