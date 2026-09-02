import { z } from 'zod';
import { SitePermissionStateEnum, WebPermissionCapabilityEnum } from './enums';
import { TrustLevelEnum } from './trust-profile';

/**
 * The "site information" the address-bar bubble shows — Chrome's Page Info panel, rebuilt.
 *
 * Two things live here, both pure and Node-free so the schema source stays single (`@tepegoz/shared-types`)
 * and the leaf omnibox can share the taxonomy without pulling the IPC layer:
 *
 *  - {@link PageSecurityLevel} + {@link classifyPageSecurity} — the transport-security verdict that
 *    drives the leading omnibox glyph (a red "Not secure" on `http://`, a lock on `https://`, a gear
 *    on an internal page). Deliberately coarse: the fine detail belongs in the bubble, not the icon.
 *  - {@link PageInfoSchema} — the full bubble payload, assembled by the main process on demand
 *    (`page-info:get`) because everything in it (cookie counts, the leaf certificate, the per-origin
 *    permission map) is too expensive to ride on every `tabs:state` push.
 */

export const PAGE_SECURITY_LEVELS = [
  /** `https://`, certificate validated by Chromium — the lock. */
  'secure',
  /** `http://` — no transport security at all. Shown red, exactly as Chrome does. `http://localhost`
   *  is included: a local dev server is still plaintext, and the screenshots this was built from show
   *  `localhost:3000` marked "not secure". */
  'not-secure',
  /** `https://` whose certificate failed to validate, or that the user clicked through a warning for. */
  'dangerous',
  /** A `tepegoz://` / `chrome://` / `about:` app page — no site, no connection to describe. */
  'internal',
  /** `file://` or `view-source:` — a local resource, not a network origin. */
  'file',
  /** Anything unparseable or scheme we do not classify — the button is hidden. */
  'unknown',
] as const;
export const PageSecurityLevelSchema = z.enum(PAGE_SECURITY_LEVELS);
export type PageSecurityLevel = (typeof PAGE_SECURITY_LEVELS)[number];

const INTERNAL_SCHEMES = new Set([
  'tepegoz:',
  'chrome:',
  'about:',
  'devtools:',
  'chrome-extension:',
]);
const FILE_SCHEMES = new Set(['file:', 'view-source:']);

export interface ClassifyPageSecurityOptions {
  /** A TLS error code recorded for this host — from the certificate recorder or the cert-error
   *  broker. Any non-empty value pushes an `https://` page to `dangerous`. */
  certErrorCode?: string | null | undefined;
  /** The user explicitly clicked through a certificate warning for this origin this run. */
  proceededPastCertError?: boolean | undefined;
}

/**
 * The transport-security verdict for a committed page URL. Pure: the caller supplies whatever it knows
 * about certificate trouble; everything else is read off the scheme.
 */
export function classifyPageSecurity(
  url: string,
  opts: ClassifyPageSecurityOptions = {},
): PageSecurityLevel {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return 'unknown';
  }
  const scheme = parsed.protocol.toLowerCase();
  if (INTERNAL_SCHEMES.has(scheme)) return 'internal';
  if (FILE_SCHEMES.has(scheme)) return 'file';
  if (scheme === 'https:') {
    const hadCertError =
      opts.certErrorCode !== null && opts.certErrorCode !== undefined && opts.certErrorCode !== '';
    return opts.proceededPastCertError === true || hadCertError ? 'dangerous' : 'secure';
  }
  if (scheme === 'http:') return 'not-secure';
  return 'unknown';
}

/** One node of a certificate chain, flattened for display. */
export const CertificateNodeSchema = z.object({
  subjectName: z.string().max(1024),
  issuerName: z.string().max(1024),
  /** ISO-8601. */
  validFrom: z.string().max(64),
  /** ISO-8601. */
  validTo: z.string().max(64),
});
export type CertificateNode = z.infer<typeof CertificateNodeSchema>;

/** The leaf certificate a site presented, plus its issuer chain — the cert-viewer's whole model. */
export const CertificateSummarySchema = CertificateNodeSchema.extend({
  serialNumber: z.string().max(128),
  /** Hex SHA-256 fingerprint of the leaf. */
  fingerprint: z.string().max(256),
  subjectAltNames: z.array(z.string().max(512)).max(256),
  /** Issuers from the leaf's parent up to (and including) the root, if Chromium handed them over. */
  chain: z.array(CertificateNodeSchema).max(16),
});
export type CertificateSummary = z.infer<typeof CertificateSummarySchema>;

/** One brokered capability's standing state for the bubble's origin. */
export const PageSitePermissionSchema = z.object({
  capability: WebPermissionCapabilityEnum,
  state: SitePermissionStateEnum,
});
export type PageSitePermission = z.infer<typeof PageSitePermissionSchema>;

/**
 * Everything the Site Info bubble renders for one page. `certificate` / `trustLevel` are `null` for a
 * page that has none (`http://`, an internal page); `permissions` carries ONLY the capabilities this
 * origin asked for or the user already decided — not the full brokered set, because a site that never
 * wanted the camera should not own a camera row (Site settings still reaches every capability).
 */
export const PageInfoSchema = z.object({
  url: z.string().max(4096),
  /** `""` for a page with no network origin (internal / file). */
  origin: z.string().max(2048),
  /** Host only, for the bubble header. `""` when there is none. */
  host: z.string().max(255),
  /** e.g. `"https:"`. */
  scheme: z.string().max(32),
  level: PageSecurityLevelSchema,
  isPrivateWindow: z.boolean(),
  certificate: CertificateSummarySchema.nullable(),
  /** A recorded/cleared TLS error code for the host, else `null`. */
  certErrorCode: z.string().max(128).nullable(),
  cookieCount: z.number().int().nonnegative(),
  permissions: z.array(PageSitePermissionSchema).max(32),
  trustLevel: TrustLevelEnum.nullable(),
});
export type PageInfo = z.infer<typeof PageInfoSchema>;
