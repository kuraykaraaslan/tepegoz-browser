/**
 * User-Agent switcher extension's host-facing contract (the "developer API" the panel is written
 * against). The host (apps/desktop, via preload `window.tepegoz`) implements {@link UserAgentHostApi};
 * the panel never reaches global bridges directly — it receives `api` as a prop, keeping the extension
 * decoupled from apps/desktop. The wire shape is intentionally tiny: the resolved UA string, or `null`
 * for the browser default. The preset catalog lives in this package (see `./presets`), not on the wire.
 */
export interface UserAgentHostApi {
  /** The currently applied selection — a UA string, or null for the browser default. */
  getUserAgent(): Promise<string | null>;
  /** Apply a UA string (or null to reset to the default). Resolves with the stored selection. */
  setUserAgent(ua: string | null): Promise<string | null>;
}
