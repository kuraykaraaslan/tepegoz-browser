import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CertificateSummary } from '@tepegoz/shared-types';

interface Bag {
  sitePermissions: Record<string, Record<string, string>>;
  /** Capabilities the broker recorded as requested this run, per origin. */
  requested: Record<string, string[]>;
  cookiesByOrigin: Record<string, number>;
  cookieProbeThrows: boolean;
  recordedCert: { verificationResult: string; errorCode: number } | undefined;
  certException: boolean;
  trustProfiles: { domain: string; level: string; tombstone: boolean }[];
}
const h = vi.hoisted<Bag>(() => ({
  sitePermissions: {},
  requested: {},
  cookiesByOrigin: {},
  cookieProbeThrows: false,
  recordedCert: undefined,
  certException: false,
  trustProfiles: [],
}));

const handlers = vi.hoisted(() => new Map<string, (e: unknown, p: unknown) => unknown>());
vi.mock('./ipc-helpers', () => ({
  handleAsync: (ch: string, fn: (e: unknown, p: unknown) => unknown) => {
    handlers.set(ch, fn);
  },
  parsePayload: (_schema: unknown, payload: unknown) => payload,
}));
vi.mock('electron', () => ({ BrowserWindow: { fromWebContents: () => ({ __win: true }) } }));
vi.mock('@tepegoz/desktop-ipc', () => ({ IpcChannels: { pageInfoGet: 'page-info:get' } }));
vi.mock('@tepegoz/desktop-ipc/schemas', () => ({ PageInfoGetSchema: {} }));

vi.mock('@tepegoz/preferences', () => ({
  default: { getAll: () => ({ sitePermissions: h.sitePermissions }) },
}));
vi.mock('../tabs', () => ({ default: { forSenderWindow: () => ({ isPrivate: false }) } }));
vi.mock('../network/browsing-sessions.electron', () => ({
  default: {
    all: () => [
      {
        partition: 'persist:tepegoz-web',
        session: {
          cookies: {
            get: ({ url }: { url: string }) =>
              h.cookieProbeThrows
                ? Promise.reject(new Error('cookie store locked'))
                : Promise.resolve(Array.from({ length: h.cookiesByOrigin[url] ?? 0 }, () => ({}))),
          },
        },
      },
    ],
  },
}));
vi.mock('../network/certificate-recorder.electron', () => ({
  getRecordedCert: () => h.recordedCert,
  toCertificateSummary: (): CertificateSummary => ({
    subjectName: 'example.com',
    issuerName: 'Example CA',
    validFrom: '2026-01-01T00:00:00.000Z',
    validTo: '2027-01-01T00:00:00.000Z',
    serialNumber: 'AA',
    fingerprint: 'sha256/leaf',
    subjectAltNames: [],
    chain: [],
  }),
}));
vi.mock('../auth/certificate-broker', () => ({ hasCertificateException: () => h.certException }));
vi.mock('../security/trust-profile-host.electron', () => ({
  listTrustProfiles: () => h.trustProfiles,
}));
vi.mock('../web-permissions/permission-broker', () => ({
  requestedCapabilities: (origin: string) => h.requested[origin] ?? [],
}));

const { buildPageInfo, registerPageInfoIpc } = await import('./ipc-page-info');

beforeEach(() => {
  h.sitePermissions = {};
  h.requested = {};
  h.cookiesByOrigin = {};
  h.cookieProbeThrows = false;
  h.recordedCert = undefined;
  h.certException = false;
  h.trustProfiles = [];
  handlers.clear();
});

describe('buildPageInfo', () => {
  it('returns the null-heavy shape for an internal page', async () => {
    const info = await buildPageInfo('tepegoz://settings#privacy', false);
    expect(info).toMatchObject({
      level: 'internal',
      origin: '',
      host: '',
      certificate: null,
      certErrorCode: null,
      cookieCount: 0,
      permissions: [],
      trustLevel: null,
    });
  });

  it('classifies http as not-secure and lists only the decided permissions', async () => {
    h.cookiesByOrigin['http://localhost:3000'] = 4;
    h.sitePermissions['http://localhost:3000'] = { camera: 'denied' };
    const info = await buildPageInfo('http://localhost:3000/app', false);
    expect(info.level).toBe('not-secure');
    expect(info.origin).toBe('http://localhost:3000');
    expect(info.cookieCount).toBe(4);
    // Only what the user decided — the five capabilities this site never asked for get no row.
    expect(info.permissions).toEqual([{ capability: 'camera', state: 'denied' }]);
  });

  it('lists a capability the site asked for this run even with nothing stored', async () => {
    h.requested['https://asks.example'] = ['geolocation'];
    const info = await buildPageInfo('https://asks.example/where', false);
    expect(info.permissions).toEqual([{ capability: 'geolocation', state: 'prompt' }]);
  });

  it('lists nothing for a site that neither asked nor was decided', async () => {
    const info = await buildPageInfo('https://quiet.example/', false);
    expect(info.permissions).toEqual([]);
  });

  it('downgrades https to dangerous when a certificate error is recorded, and attaches the summary', async () => {
    h.recordedCert = { verificationResult: 'net::ERR_CERT_DATE_INVALID', errorCode: -201 };
    const info = await buildPageInfo('https://expired.example/', false);
    expect(info.level).toBe('dangerous');
    expect(info.certErrorCode).toBe('net::ERR_CERT_DATE_INVALID');
    expect(info.certificate?.fingerprint).toBe('sha256/leaf');
  });

  it('keeps https secure when the recorded handshake verified (net::OK is not an error)', async () => {
    h.recordedCert = { verificationResult: 'net::OK', errorCode: 0 };
    const info = await buildPageInfo('https://example.com/', false);
    expect(info.level).toBe('secure');
    expect(info.certErrorCode).toBeNull();
  });

  it('reports a standing trust level for a parent domain', async () => {
    h.trustProfiles = [{ domain: 'example.com', level: 'trusted', tombstone: false }];
    const info = await buildPageInfo('https://app.example.com/', false);
    expect(info.trustLevel).toBe('trusted');
  });

  it('returns the empty shape for an unparseable URL without throwing', async () => {
    const info = await buildPageInfo('not a url', false);
    expect(info).toMatchObject({
      origin: '',
      host: '',
      scheme: '',
      certErrorCode: null,
      cookieCount: 0,
      permissions: [],
      trustLevel: null,
    });
  });

  it('counts zero cookies (not a throw) when a partition probe fails', async () => {
    h.cookieProbeThrows = true;
    const info = await buildPageInfo('https://x.example/', false);
    expect(info.cookieCount).toBe(0);
  });

  it('reports ERR_CERT_INVALID when the user proceeded past a cert error with none recorded', async () => {
    h.certException = true; // clicked through, but nothing in the recorder
    const info = await buildPageInfo('https://clicked-through.example/', false);
    expect(info.certErrorCode).toBe('net::ERR_CERT_INVALID');
    expect(info.level).toBe('dangerous');
  });
});

describe('registerPageInfoIpc', () => {
  it('wires a page-info:get handler that builds info for the sender window', async () => {
    registerPageInfoIpc();
    const handler = handlers.get('page-info:get')!;
    const info = (await handler({ sender: {} }, { url: 'https://example.com/deep/path' })) as {
      origin: string;
      isPrivateWindow: boolean;
    };
    expect(info.origin).toBe('https://example.com');
    expect(info.isPrivateWindow).toBe(false);
  });
});
