import { session, type Session } from 'electron';
import { Logger } from '@tepegoz/libs';
import PreferenceStore from '@tepegoz/preferences';
import TabManager, { BROWSING_PARTITION } from './tabs';

/**
 * Owns the User-Agent override for browsed pages (the User-Agent switcher extension's host side). The
 * selection — a concrete UA string, or `null` for the browser's own default — is persisted in
 * preferences and applied to the isolated browsing session ({@link BROWSING_PARTITION}) so every page
 * identifies itself accordingly. Applying also re-stamps + reloads the open tabs so the change takes
 * effect at once. The app chrome's own session is never touched.
 */
export default class UserAgentManager {
  /** The browser's real UA, captured at init; restored when the selection is null. */
  private static defaultUa = '';
  /** The persisted selection: a UA string, or null for the default. */
  private static current: string | null = null;

  /** Read the persisted selection and apply it to the browsing session (call after app is ready). */
  static init(): void {
    const s = UserAgentManager.browsingSession();
    UserAgentManager.defaultUa = s.getUserAgent();
    UserAgentManager.current = PreferenceStore.getAll().userAgent;
    s.setUserAgent(UserAgentManager.effective());
  }

  static get(): string | null {
    return UserAgentManager.current;
  }

  /** Persist + apply a new selection (a UA string, or null to reset). Returns the stored value. */
  static set(ua: string | null): string | null {
    const next = ua !== null && ua.trim().length === 0 ? null : ua;
    UserAgentManager.current = next;
    PreferenceStore.update({ userAgent: next });
    const resolved = UserAgentManager.effective();
    UserAgentManager.browsingSession().setUserAgent(resolved);
    TabManager.applyUserAgent(resolved);
    Logger.info('User-Agent override applied', { isDefault: next === null });
    return next;
  }

  /** The concrete UA to send on the wire (the selection, or the captured default when null). */
  private static effective(): string {
    return UserAgentManager.current ?? UserAgentManager.defaultUa;
  }

  private static browsingSession(): Session {
    return session.fromPartition(BROWSING_PARTITION);
  }
}
