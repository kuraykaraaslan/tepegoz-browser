/**
 * Popup Blocker (strict) extension's host-facing contract + persisted settings shape. The extension
 * OWNS these wire types (like the Agent extension); the desktop IPC contract imports them, so the
 * extension stays decoupled from apps/desktop. The panel talks to the host ONLY through the injected
 * {@link PopupBlockerHostApi} — never a global bridge.
 */

/** Popup Blocker (strict) settings: block popups by default, allowing only trusted origins. */
export interface PopupBlockerSettings {
  /** Master on/off. When off, popups open as tabs (pre-blocker behavior). */
  enabled: boolean;
  /** Raise a notification (toast + center) each time a popup is blocked. */
  showNotifications: boolean;
  /** Origins whose popups are always allowed (page origin, e.g. "https://example.com"). */
  trustedOrigins: string[];
}

/** A single blocked-popup event recorded this session (not persisted; resets on restart). */
export interface PopupBlockerRequest {
  /** Unique key: "popup:<sourceOrigin>:<popupUrl>" (same as the notification dedupeKey). */
  id: string;
  sourceOrigin: string;
  popupUrl: string;
  /** Unix timestamp (ms) when the popup was blocked. */
  blockedAt: number;
}

/** What the Popup Blocker panel needs from the host — a small, typed surface (injected, not a global). */
export interface PopupBlockerHostApi {
  /** The current popup-blocker settings. */
  getPopupBlockerSettings(): Promise<PopupBlockerSettings>;
  /** Patch settings (only provided keys change). Resolves with the stored settings. */
  setPopupBlockerSettings(patch: Partial<PopupBlockerSettings>): Promise<PopupBlockerSettings>;
  /** The most-recent blocked-popup events this session (newest first, max 20). */
  getRecentRequests(): Promise<PopupBlockerRequest[]>;
  /** Open a URL in a background tab (used by the "Open" action in the recent-requests list). */
  createTabInBackground(url: string): void;
}
