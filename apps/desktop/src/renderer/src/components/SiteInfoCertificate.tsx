import type { ReactNode } from 'react';
import type { CertificateSummary } from '@tepegoz/shared-types';
import type { siteInfoDict } from '../../../i18n';

/** This bubble's strings for ONE locale — what `useT(siteInfoDict)` hands back. */
export type SiteInfoStrings = (typeof siteInfoDict)['en'];

/** Chrome's certificate viewer, General tab: who it was issued to and by, for how long, its prints. */
export function CertificateView({
  cert,
  valid,
  t,
}: {
  cert: CertificateSummary;
  valid: boolean;
  t: SiteInfoStrings;
}) {
  return (
    <div className="px-4 pb-4">
      <p className={`mb-3 text-xs font-medium ${valid ? 'text-text-secondary' : 'text-error'}`}>
        {valid ? t.certificateValid : t.certificateInvalid}
      </p>
      <CertSection title={t.certSubjectName}>
        <CertRow label={t.certCommonName} value={cert.subjectName} />
        {cert.serialNumber !== '' && (
          <CertRow label={t.certSerial} value={cert.serialNumber} mono />
        )}
      </CertSection>
      <CertSection title={t.certIssuerName}>
        <CertRow label={t.certCommonName} value={cert.issuerName} />
      </CertSection>
      <CertSection title={t.certValidityPeriod}>
        <CertRow label={t.certValidFrom} value={fmtDate(cert.validFrom)} />
        <CertRow label={t.certValidTo} value={fmtDate(cert.validTo)} />
      </CertSection>
      <CertSection title={t.certFingerprint}>
        <CertRow label="SHA-256" value={cert.fingerprint} mono />
      </CertSection>
      {cert.subjectAltNames.length > 0 && (
        <CertSection title={t.certSan}>
          <p className="break-all text-xs text-text-primary">{cert.subjectAltNames.join(', ')}</p>
        </CertSection>
      )}
      {cert.chain.length > 0 && (
        <CertSection title={t.certChain}>
          <ol className="space-y-1 text-xs text-text-primary">
            {cert.chain.map((node, i) => (
              <li key={`${node.subjectName}-${String(i)}`} className="break-all">
                <span className="text-text-secondary">{'— '.repeat(i + 1)}</span>
                {node.subjectName}
              </li>
            ))}
          </ol>
        </CertSection>
      )}
    </div>
  );
}

function CertSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-3 last:mb-0">
      <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-text-secondary">
        {title}
      </p>
      <dl className="space-y-1 rounded-lg border border-border px-3 py-2">{children}</dl>
    </section>
  );
}

function CertRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-3 text-xs">
      <dt className="shrink-0 text-text-secondary">{label}</dt>
      <dd
        className={`min-w-0 break-all text-right text-text-primary ${mono === true ? 'font-mono' : ''}`}
      >
        {value}
      </dd>
    </div>
  );
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString();
}
