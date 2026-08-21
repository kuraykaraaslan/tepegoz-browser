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

/** Content-area rectangle (DIP) where the active tab's web view is laid out, below the chrome. */
export interface ContentBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}
