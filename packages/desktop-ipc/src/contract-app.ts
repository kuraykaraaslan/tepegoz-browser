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

/** Content-area rectangle (DIP) where the active tab's web view is laid out, below the chrome. */
export interface ContentBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}
