/**
 * Core app + web-permission + layout wire types for the desktop IPC contract. Zod-free, preload-safe.
 */

/**
 * The engine versions a site-compatibility complaint or a crash report is worthless without. A browser
 * that cannot tell its user which Chromium it renders with cannot ask that user for a useful bug report.
 */
export interface AppEngineVersions {
  chromium: string;
  electron: string;
  node: string;
  v8: string;
}

/**
 * Where this binary came from. `commit`/`builtAt` are stamped at build time and are `''` in a run that
 * carried no stamp (a plain `vitest` process) — an empty string is the honest answer there, not a
 * fabricated one. `packaged` distinguishes a release from a developer's `pnpm dev`.
 */
export interface AppBuildInfo {
  /** Release channel: `dev` for an unpackaged run, otherwise whatever the build stamped. */
  channel: string;
  /** Short commit sha the build came from, or `''` when unstamped. */
  commit: string;
  /** ISO-8601 build timestamp, or `''` when unstamped. */
  builtAt: string;
  packaged: boolean;
}

/** The host OS, resolved to names a person recognises. Proper nouns — never translated. */
export interface AppOsInfo {
  /** e.g. `Windows 11`, `macOS`, `Linux`. */
  name: string;
  /** OS/kernel release, e.g. `10.0.26200`. */
  version: string;
  /** CPU architecture, e.g. `x64`, `arm64`. */
  arch: string;
}

export interface AppInfo {
  name: string;
  version: string;
  /** Raw `process.platform` (`win32`/`darwin`/`linux`). Machine-facing — show {@link AppOsInfo} to people. */
  platform: string;
  /** True when the OS supports the translucent "glass" chrome (Windows 11 Mica). Gates the Settings toggle. */
  glassAvailable: boolean;
  os: AppOsInfo;
  engines: AppEngineVersions;
  build: AppBuildInfo;
  /** SPDX id of Tepegöz's own license. AGPL-3.0-only obliges the UI to point at the source. */
  license: string;
}

/** Whether Tepegöz is currently the OS's registered handler for http/https. Re-read from the OS, never
 *  cached — the user can change it from outside this app (the OS's own default-apps Settings). */
export interface DefaultBrowserStatus {
  isDefault: boolean;
}

import type { WebPermissionCapability } from '@tepegoz/shared-types';

export type { WebPermissionCapability };

/**
 * One row of the per-agent permission matrix: a registered capability and the verdict the Policy
 * Kernel gives it. A VIEW, never a control — the kernel is the single decision engine, and a second
 * one behind a settings toggle would leave the user unable to tell which was in force.
 */
export interface AgentCapabilityRow {
  /** Tool id, e.g. `browser_update_location`. */
  id: string;
  /** The tool's declared danger class, shown so the verdict is explainable. */
  dangerClass: string;
  /** The Policy Kernel's own decision union: `allow` runs, `ask` asks first, `deny` refuses. */
  decision: 'allow' | 'ask' | 'deny';
}

/** Main → renderer: a site asked for a web capability; the renderer shows the consent prompt. */
export interface WebPermissionRequest {
  requestId: string;
  origin: string;
  capability: WebPermissionCapability;
}

/** Back-compat alias for the notification prompt bridge while the UI becomes capability-aware. */
export type NotificationPermissionRequest = WebPermissionRequest;

/** Renderer → main: the user's consent answer. `remember` persists it to `sitePermissions`. */
export interface NotificationPermissionResponse {
  requestId: string;
  allow: boolean;
  remember: boolean;
}

/** Main → renderer: an HTTP 401/407 challenge needs credentials. `realm` is server-supplied and
 *  untrusted — display-only, already length-capped by main. */
export interface BasicAuthRequest {
  requestId: string;
  origin: string;
  realm: string;
  /** True when a network PROXY issued the challenge rather than the page being visited. */
  isProxy: boolean;
}

/** Renderer → main: the user's answer to a basic-auth challenge. Credentials are passed straight to
 *  Chromium's callback and are never persisted, journaled or logged. */
export interface BasicAuthResponse {
  requestId: string;
  username: string;
  password: string;
  cancelled: boolean;
}

/** Main → renderer: a TLS certificate error is waiting on the user. All fields are display-only and
 *  already length-capped by main; `issuer` in particular is attacker-controlled. */
export interface CertificateErrorRequest {
  requestId: string;
  origin: string;
  /** Chromium's error code, e.g. `net::ERR_CERT_AUTHORITY_INVALID`. */
  errorCode: string;
  issuer: string;
  /** ISO-8601 expiry of the offered certificate. */
  expiry: string;
}

/** Renderer → main: whether to proceed past the certificate error. */
export interface CertificateErrorResponse {
  requestId: string;
  proceed: boolean;
}

/** One certificate the OS store offered for a site's client-authentication request. Display-only, and
 *  every field is capped by main before it crosses — `subject` and `issuer` come from a certificate the
 *  REQUESTING SITE's CA chain vouches for, not from us. */
export interface ClientCertificateOption {
  /** Index into the list main is holding. The certificate itself never crosses to the renderer. */
  index: number;
  subject: string;
  issuer: string;
  /** ISO-8601. Shown so a user can tell two otherwise identical certificates apart. */
  expiry: string;
}

/**
 * Main → renderer: a site is asking the user to identify themselves with a client certificate.
 *
 * This prompt exists because Electron's default is to send the FIRST certificate in the store without
 * asking anyone — see `auth/client-certificate-broker.ts`.
 */
export interface ClientCertificateRequest {
  requestId: string;
  origin: string;
  options: ClientCertificateOption[];
}

/** Renderer → main: which certificate to send, or none. `index: null` means "send nothing". */
/**
 * One remembered client-certificate decision, for the review surface. ORIGIN ONLY — the certificate
 * never leaves the main process, so neither does the subject that names the user.
 */
export interface ClientCertificateChoice {
  origin: string;
  /** true = a certificate was sent to this origin; false = the user refused, and that is remembered too. */
  sent: boolean;
}

export interface ClientCertificateResponse {
  requestId: string;
  index: number | null;
}

/** Content-area rectangle (DIP) where the active tab's web view is laid out, below the chrome. */
export interface ContentBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}
