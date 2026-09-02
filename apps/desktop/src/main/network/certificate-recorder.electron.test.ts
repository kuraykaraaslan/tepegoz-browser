import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Certificate } from 'electron';

const h = vi.hoisted(() => ({
  register: vi.fn<(id: string, attacher: (ses: { setCertificateVerifyProc: unknown }) => void) => void>(),
}));
vi.mock('./browsing-sessions.electron', () => ({ default: { register: h.register } }));

const {
  certificateVerifyProc,
  getRecordedCert,
  registerCertificateRecorder,
  resetForTests,
  toCertificateSummary,
} = await import('./certificate-recorder.electron');

/** A minimal Electron `Certificate`. `validStart`/`validExpiry` are epoch SECONDS. */
function makeCert(over: Partial<Certificate> = {}): Certificate {
  return {
    data: '-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----',
    issuer: { commonName: 'Issuer CA', organizations: [], organizationUnits: [], locality: '', state: '', country: '' },
    issuerName: 'Issuer CA',
    subject: { commonName: 'example.com', organizations: [], organizationUnits: [], locality: '', state: '', country: '' },
    subjectName: 'example.com',
    serialNumber: '0A1B2C3D',
    validStart: Math.floor(Date.parse('2026-01-01T00:00:00Z') / 1000),
    validExpiry: Math.floor(Date.parse('2027-01-01T00:00:00Z') / 1000),
    fingerprint: 'sha256/leaf',
    ...over,
  } as Certificate;
}

beforeEach(() => {
  resetForTests();
  h.register.mockClear();
});

describe('the verify proc never decides', () => {
  it('always calls callback(-3) — Chromium keeps the verdict — on a clean handshake', () => {
    const cb = vi.fn();
    certificateVerifyProc(
      { hostname: 'example.com', certificate: makeCert(), verificationResult: 'net::OK', errorCode: 0 },
      cb,
    );
    expect(cb).toHaveBeenCalledExactlyOnceWith(-3);
  });

  it('still calls callback(-3), never 0, when the handshake did NOT verify', () => {
    const cb = vi.fn();
    certificateVerifyProc(
      {
        hostname: 'bad.example',
        certificate: makeCert({ fingerprint: 'sha256/bad' }),
        verificationResult: 'net::ERR_CERT_AUTHORITY_INVALID',
        errorCode: -202,
      },
      cb,
    );
    expect(cb).toHaveBeenCalledExactlyOnceWith(-3);
  });
});

describe('registerCertificateRecorder', () => {
  it('registers a browsing-session attacher that installs the proc', () => {
    registerCertificateRecorder();
    expect(h.register).toHaveBeenCalledOnce();
    const [id, attacher] = h.register.mock.calls[0]!;
    expect(id).toBe('cert-recorder');
    const setCertificateVerifyProc = vi.fn();
    attacher({ setCertificateVerifyProc });
    expect(setCertificateVerifyProc).toHaveBeenCalledWith(certificateVerifyProc);
  });
});

describe('recording + summary', () => {
  it('keeps the most recent certificate per host and flattens the issuer chain', () => {
    const root = makeCert({ subjectName: 'Root CA', issuerName: 'Root CA', fingerprint: 'sha256/root' });
    root.issuerCert = root; // a self-issued root must not loop
    const intermediate = makeCert({
      subjectName: 'Intermediate CA',
      issuerName: 'Root CA',
      fingerprint: 'sha256/intermediate',
      issuerCert: root,
    });
    const leaf = makeCert({ issuerCert: intermediate });

    certificateVerifyProc(
      { hostname: 'Example.com', certificate: leaf, verificationResult: 'net::OK', errorCode: 0 },
      vi.fn(),
    );

    const recorded = getRecordedCert('example.com'); // lookup is case-insensitive
    expect(recorded?.certificate.fingerprint).toBe('sha256/leaf');

    const summary = toCertificateSummary(recorded!);
    expect(summary.subjectName).toBe('example.com');
    expect(summary.validFrom).toBe('2026-01-01T00:00:00.000Z');
    expect(summary.chain.map((n) => n.subjectName)).toEqual(['Intermediate CA', 'Root CA']);
  });

  it('evicts the least-recently-seen host past the cap', () => {
    for (let i = 0; i < 256; i++) {
      certificateVerifyProc(
        { hostname: `h${i}.example`, certificate: makeCert(), verificationResult: 'net::OK', errorCode: 0 },
        vi.fn(),
      );
    }
    expect(getRecordedCert('h0.example')).toBeDefined();
    // One more host tips it over 256 → the oldest (h1, since the h0 lookup above refreshed it) goes.
    certificateVerifyProc(
      { hostname: 'h256.example', certificate: makeCert(), verificationResult: 'net::OK', errorCode: 0 },
      vi.fn(),
    );
    expect(getRecordedCert('h1.example')).toBeUndefined();
    expect(getRecordedCert('h0.example')).toBeDefined();
    expect(getRecordedCert('h256.example')).toBeDefined();
  });
});
