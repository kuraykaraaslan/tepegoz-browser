import { beforeEach, describe, expect, it, vi } from 'vitest';

const append = vi.fn();
const getDb = vi.fn();

vi.mock('@tepegoz/persistence', () => ({
  EventJournal: {
    append: (...a: unknown[]): void => {
      append(...a);
    },
  },
}));
vi.mock('../db/database.electron', () => ({ getDb: () => getDb() as unknown }));
vi.mock('@tepegoz/libs', () => ({ Logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } }));

const { journalCertificateProceed, journalClientCertificateSent } =
  await import('./certificate-journal');

/**
 * Two decisions a user can make against the browser's own safe default, and the record they leave.
 * The properties worth pinning are what the record must NOT contain, and that writing it can never
 * cost the decision it was auditing.
 */
beforeEach(() => {
  vi.clearAllMocks();
  getDb.mockReturnValue({ fake: 'db' });
});

function lastEvent(): Record<string, unknown> {
  return (append.mock.calls[0] as [unknown, Record<string, unknown>])[1];
}

describe('journalCertificateProceed', () => {
  it('records the origin and the error code as a user decision', () => {
    journalCertificateProceed('https://intranet.example', 'ERR_CERT_AUTHORITY_INVALID');
    const e = lastEvent();
    expect(e.type).toBe('CertificateErrorProceeded');
    // 'user', not 'system': an agent cannot reach this decision at all — the sensitive-site lockout
    // hard-blocks that path with no prompt shown.
    expect(e.actor).toBe('user');
    expect(e.redacted).toBe(true);
    expect(e.payload).toMatchObject({
      origin: 'https://intranet.example',
      errorCode: 'ERR_CERT_AUTHORITY_INVALID',
    });
  });
});

describe('journalClientCertificateSent', () => {
  it('records WHICH certificate by fingerprint', () => {
    journalClientCertificateSent('https://edevlet.example', 'sha256/AAAA');
    const e = lastEvent();
    expect(e.type).toBe('ClientCertificateSent');
    expect(e.payload).toMatchObject({
      origin: 'https://edevlet.example',
      fingerprint: 'sha256/AAAA',
    });
  });

  it('does not take the subject, which is the user’s own name', () => {
    // In this product's primary market an e-Devlet certificate's subject carries a national ID. The
    // journal is permanent and local; the identity must not be in it. The fingerprint answers "which
    // certificate" without answering "who".
    journalClientCertificateSent('https://edevlet.example', 'sha256/AAAA');
    expect(JSON.stringify(lastEvent())).not.toContain('CN=');
    expect(Object.keys(lastEvent().payload as object)).toEqual(
      expect.not.arrayContaining(['subject', 'subjectName', 'issuer', 'data']),
    );
  });
});

describe('never costs the decision it audits', () => {
  it('writes nothing, and does not throw, with no database', () => {
    getDb.mockReturnValue(null);
    expect(() => {
      journalCertificateProceed('https://a.example', 'ERR');
    }).not.toThrow();
    expect(append).not.toHaveBeenCalled();
  });

  it('swallows an append failure rather than propagating it', () => {
    // An audit write that threw here would turn a working refusal into a hung connection: both
    // callers are inside an Electron event handler feeding a Chromium callback.
    append.mockImplementation(() => {
      throw new Error('disk full');
    });
    expect(() => {
      journalClientCertificateSent('https://a.example', 'sha256/AAAA');
    }).not.toThrow();
  });
});
