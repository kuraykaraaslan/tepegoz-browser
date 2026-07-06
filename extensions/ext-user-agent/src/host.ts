import { userAgentManifest } from './manifest';

/**
 * Host side of the User-Agent switcher extension (ADR-0024 pattern). Owns the selection state (a
 * concrete UA string, or `null` for the browser's default) and the apply logic; everything
 * Electron-coupled (preference persistence, the browsing session, re-stamping open tabs) is injected
 * as {@link UserAgentPorts} by the main-process wiring
 * (`apps/desktop/src/main/extensions/user-agent-host.electron.ts`), mirroring
 * `@tepegoz/ext-popup-blocker`'s `createPopupBlockerHost`.
 *
 * The extension being disabled/absent must degrade to the browser's own UA: `set` becomes a no-op and
 * `init` always applies the captured default. `isEnabled` is injected (computed from
 * `preferences.extensions`), so desktop core stays oblivious to extension state — it just calls
 * `get`/`set`.
 */
export interface UserAgentPorts {
  /** The persisted selection (a UA string, or null for the default). */
  getPersisted(): string | null;
  /** Persist the selection. */
  setPersisted(ua: string | null): void;
  /** The browsing session's real UA, captured once at init (restored when the selection is null). */
  defaultUserAgent(): string;
  /** Apply a concrete UA to the browsing session on the wire. */
  applyToSession(ua: string): void;
  /** Re-stamp + reload the open tabs so the change takes effect at once. */
  applyToTabs(ua: string): void;
  /** Whether the User-Agent extension is currently enabled (from prefs). */
  isEnabled(): boolean;
}

export interface UserAgentHost {
  /** Read the persisted selection and apply it to the browsing session. Call after the app is ready.
   *  When the extension is disabled, applies the browser's default (never a stale override). */
  init(): void;
  get(): string | null;
  /** Persist + apply a new selection (a UA string, or null to reset). Returns the stored value.
   *  No-op (returns the current value) when the extension is disabled. */
  set(ua: string | null): string | null;
}

export const USER_AGENT_EXTENSION_ID = userAgentManifest.id;

export function createUserAgentHost(ports: UserAgentPorts): UserAgentHost {
  let current: string | null = null;

  /** The concrete UA to send on the wire: the selection, or the captured default when null/disabled. */
  const effective = (): string =>
    (ports.isEnabled() ? current : null) ?? ports.defaultUserAgent();

  return {
    init(): void {
      current = ports.getPersisted();
      ports.applyToSession(effective());
    },

    get(): string | null {
      return current;
    },

    set(ua: string | null): string | null {
      if (!ports.isEnabled()) return current; // disabled → core browsing keeps the default UA
      const next = ua !== null && ua.trim().length === 0 ? null : ua;
      current = next;
      ports.setPersisted(next);
      const resolved = effective();
      ports.applyToSession(resolved);
      ports.applyToTabs(resolved);
      return next;
    },
  };
}
