import { describe, expect, it } from 'vitest';
import {
  CertificateSummarySchema,
  PageInfoSchema,
  classifyPageSecurity,
} from './page-info';

/**
 * The address bar's leading glyph is the first thing a user reads against Chrome, and the one line
 * that matters is `http://` → red "Not secure" — including `http://localhost`, which the screenshots
 * this feature was built from show marked exactly that way. These cases pin the taxonomy so a later
 * "localhost is basically secure" tweak has to argue with a test.
 */

describe('classifyPageSecurity', () => {
  it('maps https with a clean certificate to secure', () => {
    expect(classifyPageSecurity('https://example.com/a?b=c#d')).toBe('secure');
  });

  it('maps http to not-secure, localhost included', () => {
    expect(classifyPageSecurity('http://example.com')).toBe('not-secure');
    expect(classifyPageSecurity('http://localhost:3000/')).toBe('not-secure');
    expect(classifyPageSecurity('http://127.0.0.1:8080')).toBe('not-secure');
  });

  it('maps https with a recorded certificate error to dangerous', () => {
    expect(classifyPageSecurity('https://expired.example', { certErrorCode: 'net::ERR_CERT_DATE_INVALID' })).toBe(
      'dangerous',
    );
    expect(classifyPageSecurity('https://self-signed.example', { proceededPastCertError: true })).toBe(
      'dangerous',
    );
    // An empty / null code is "no error", not a truthy string.
    expect(classifyPageSecurity('https://example.com', { certErrorCode: '' })).toBe('secure');
    expect(classifyPageSecurity('https://example.com', { certErrorCode: null })).toBe('secure');
  });

  it('maps app pages to internal and local resources to file', () => {
    expect(classifyPageSecurity('tepegoz://settings#privacy')).toBe('internal');
    expect(classifyPageSecurity('chrome://flags')).toBe('internal');
    expect(classifyPageSecurity('about:blank')).toBe('internal');
    expect(classifyPageSecurity('file:///C:/Users/x/notes.html')).toBe('file');
    expect(classifyPageSecurity('view-source:https://example.com')).toBe('file');
  });

  it('maps an unparseable or unclassified URL to unknown', () => {
    expect(classifyPageSecurity('not a url')).toBe('unknown');
    expect(classifyPageSecurity('')).toBe('unknown');
    expect(classifyPageSecurity('mailto:a@b.com')).toBe('unknown');
  });
});

describe('PageInfoSchema', () => {
  const cert = {
    subjectName: 'example.com',
    issuerName: "Example Root CA",
    validFrom: '2026-01-01T00:00:00.000Z',
    validTo: '2027-01-01T00:00:00.000Z',
    serialNumber: '0A1B2C',
    fingerprint: 'ab:cd:ef',
    subjectAltNames: ['example.com', 'www.example.com'],
    chain: [
      {
        subjectName: 'Example Root CA',
        issuerName: 'Example Root CA',
        validFrom: '2020-01-01T00:00:00.000Z',
        validTo: '2040-01-01T00:00:00.000Z',
      },
    ],
  };

  it('round-trips a fully populated secure page', () => {
    const parsed = PageInfoSchema.safeParse({
      url: 'https://example.com/',
      origin: 'https://example.com',
      host: 'example.com',
      scheme: 'https:',
      level: 'secure',
      isPrivateWindow: false,
      certificate: cert,
      certErrorCode: null,
      cookieCount: 3,
      permissions: [
        { capability: 'camera', state: 'denied' },
        { capability: 'geolocation', state: 'allowed' },
      ],
      trustLevel: 'trusted',
    });
    expect(parsed.success).toBe(true);
  });

  it('accepts the null-heavy shape an internal page produces', () => {
    const parsed = PageInfoSchema.safeParse({
      url: 'tepegoz://settings',
      origin: '',
      host: '',
      scheme: 'tepegoz:',
      level: 'internal',
      isPrivateWindow: false,
      certificate: null,
      certErrorCode: null,
      cookieCount: 0,
      permissions: [],
      trustLevel: null,
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects an unknown permission state', () => {
    expect(CertificateSummarySchema.safeParse(cert).success).toBe(true);
    const parsed = PageInfoSchema.safeParse({
      url: 'https://example.com/',
      origin: 'https://example.com',
      host: 'example.com',
      scheme: 'https:',
      level: 'secure',
      isPrivateWindow: false,
      certificate: null,
      certErrorCode: null,
      cookieCount: 0,
      permissions: [{ capability: 'camera', state: 'maybe' }],
      trustLevel: null,
    });
    expect(parsed.success).toBe(false);
  });
});
