import type { Certificate } from 'electron';
import { Logger } from '@tepegoz/libs';
import type { CertificateNode, CertificateSummary } from '@tepegoz/shared-types';
import BrowsingSessions from './browsing-sessions.electron';

/**
 * Remembers the leaf certificate a host presented, so the Site Info bubble can show a certificate
 * viewer.
 *
 * Electron gives no API to read the certificate of an already-loaded page — `webContents` has none,
 * and `app.on('certificate-error')` only fires on failure. The standard workaround is to observe
 * every TLS verification: `session.setCertificateVerifyProc` hands us `request.certificate` (with its
 * `.issuerCert` chain) for *successful* handshakes too.
 *
 * Two rules make owning that hook safe:
 *
 *  1. **The proc never decides.** It calls `callback(-3)` unconditionally — "use Chromium's own
 *     verdict". Returning `0` (accept) here would trust every certificate on the machine; this module
 *     must be incapable of that, which is why there is no branch that calls `callback` with anything
 *     else. `certificate-error` still fires for a genuinely bad certificate, exactly as before.
 *  2. **Bounded.** An LRU keyed by hostname, capped — a single-user browser visits a bounded set of
 *     hosts in a session, and an unbounded map of PEM blobs is a slow memory leak.
 *
 * Registered as a NON-critical browsing-session attacher: if it ever throws, a tab still loads, it
 * just has no cert to show in the bubble.
 */

/** How many hosts' certificates to keep. Past this the least-recently-seen host is dropped. */
const MAX_HOSTS = 256;
/** Chromium chains can loop (a root lists itself as its own issuer); also a hard stop on absurd depth. */
const MAX_CHAIN_DEPTH = 16;

export interface RecordedCert {
  certificate: Certificate;
  /** `'net::OK'` for a clean handshake, else the Chromium error string. */
  verificationResult: string;
  /** `0` when the handshake verified. */
  errorCode: number;
  /** Epoch ms this was last seen. */
  at: number;
}

/** The subset of Electron's verify-proc request this module reads. */
interface CertificateVerifyRequest {
  hostname: string;
  certificate: Certificate;
  verificationResult: string;
  errorCode: number;
}

const byHost = new Map<string, RecordedCert>();

function touch(host: string, entry: RecordedCert): void {
  // Delete-then-set moves the key to the end (most-recently-used) of the Map's insertion order.
  byHost.delete(host);
  byHost.set(host, entry);
  while (byHost.size > MAX_HOSTS) {
    const oldest = byHost.keys().next().value;
    if (oldest === undefined) break;
    byHost.delete(oldest);
  }
}

/**
 * The verify proc. Records what it saw, then defers the actual trust decision to Chromium
 * (`callback(-3)`). Deliberately has no other `callback` call site.
 */
export function certificateVerifyProc(
  request: CertificateVerifyRequest,
  callback: (verificationResult: number) => void,
): void {
  try {
    const host = request.hostname.toLowerCase();
    if (host !== '') {
      touch(host, {
        certificate: request.certificate,
        verificationResult: request.verificationResult,
        errorCode: request.errorCode,
        at: Date.now(),
      });
    }
  } catch (err) {
    Logger.warn('Certificate recorder threw while recording; ignoring', { err: String(err) });
  }
  callback(-3);
}

/** Install the recorder on every browsing session (present and future). Call once at startup. */
export function registerCertificateRecorder(): void {
  BrowsingSessions.register('cert-recorder', (ses) => {
    ses.setCertificateVerifyProc(certificateVerifyProc);
  });
}

/** The most recent certificate seen for `host`, or undefined. Marks it most-recently-used. */
export function getRecordedCert(host: string): RecordedCert | undefined {
  const key = host.toLowerCase();
  const entry = byHost.get(key);
  if (entry !== undefined) touch(key, entry);
  return entry;
}

function iso(epochSeconds: number): string {
  const ms = epochSeconds * 1000;
  return Number.isFinite(ms) && ms > 0 ? new Date(ms).toISOString() : '';
}

function node(cert: Certificate): CertificateNode {
  return {
    subjectName: cert.subjectName || cert.subject?.commonName || '',
    issuerName: cert.issuerName || cert.issuer?.commonName || '',
    validFrom: iso(cert.validStart),
    validTo: iso(cert.validExpiry),
  };
}

/**
 * Flatten a recorded certificate (leaf + issuer chain) into the viewer's model. Walks `.issuerCert`
 * until it repeats (a self-issued root) or the depth cap is hit.
 *
 * Electron's `Certificate` carries no subjectAltNames, so that field is left empty here — the schema
 * keeps it for a later PEM parse; the bubble simply omits the SAN block when it is empty.
 */
export function toCertificateSummary(recorded: RecordedCert): CertificateSummary {
  const leaf = recorded.certificate;
  const chain: CertificateNode[] = [];
  const seen = new Set<string>([leaf.fingerprint]);
  let current: Certificate | undefined = leaf.issuerCert;
  while (current !== undefined && chain.length < MAX_CHAIN_DEPTH && !seen.has(current.fingerprint)) {
    seen.add(current.fingerprint);
    chain.push(node(current));
    current = current.issuerCert === current ? undefined : current.issuerCert;
  }
  return {
    ...node(leaf),
    serialNumber: leaf.serialNumber ?? '',
    fingerprint: leaf.fingerprint ?? '',
    subjectAltNames: [],
    chain,
  };
}

/** Test seam: forget every recorded certificate. */
export function resetForTests(): void {
  byHost.clear();
}
