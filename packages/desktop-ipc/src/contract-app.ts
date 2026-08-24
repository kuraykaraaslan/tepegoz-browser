/**
 * Core app + web-permission + layout wire types for the desktop IPC contract. Zod-free, preload-safe.
 */

export interface AppInfo {
  name: string;
  version: string;
  platform: string;
  /** True when the OS supports the translucent "glass" chrome (Windows 11 Mica). Gates the Settings toggle. */
  glassAvailable: boolean;
}

export type WebPermissionCapability = 'notifications' | 'clipboardRead' | 'clipboardWrite';

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
