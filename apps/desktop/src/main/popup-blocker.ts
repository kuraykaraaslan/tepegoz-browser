import { pick } from '@tepegoz/i18n';
import { popupBlockerDict } from '@tepegoz/ext-popup-blocker/i18n';
import { DEFAULT_TRUSTED_POPUP_ORIGINS } from '@tepegoz/ext-popup-blocker/default-trusted-origins';
import type { PopupBlockerRequest, PopupBlockerSettings } from '@tepegoz/desktop-ipc';
import PreferenceStore from '@tepegoz/preferences';
import NotificationHost from './notifications/notification-host';
import { mainLocale } from './lib/i18n-main';

/**
 * Host side of the Popup Blocker (strict) extension. Owns the in-memory settings (loaded from + persisted
 * to preferences) and the block decision consulted by `TabManager`'s `setWindowOpenHandler`. When a popup
 * is blocked it raises a `@tepegoz/notifications` notification whose inline actions (allow / background /
 * redirect / trust) are executed by the renderer's declarative `runNotificationAction` dispatcher.
 */
export default class PopupBlockerManager {
  private static settings: PopupBlockerSettings = {
    enabled: true,
    showNotifications: true,
    trustedOrigins: [],
  };

  private static readonly recentRequests: PopupBlockerRequest[] = [];

  /** Load persisted settings (call after PreferenceStore.init, before the first tab opens). On first run
   *  this also seeds the curated default trusted origins so common OAuth / payment / collaboration popups
   *  work out of the box. */
  static init(): void {
    PopupBlockerManager.settings = PopupBlockerManager.seedDefaultTrustedOrigins();
  }

  /** One-time seed: union the curated default trusted origins into the persisted allowlist and mark it
   *  seeded, so a user who later removes a default is respected (it is never re-added). No-op once seeded.
   *  Returns the settings to hold in memory. */
  private static seedDefaultTrustedOrigins(): PopupBlockerSettings {
    const prefs = PreferenceStore.getAll();
    if (prefs.popupBlockerSeeded) return prefs.popupBlocker;
    const merged = [
      ...new Set([...prefs.popupBlocker.trustedOrigins, ...DEFAULT_TRUSTED_POPUP_ORIGINS]),
    ].slice(0, 500); // stay within the schema's trustedOrigins cap
    const next: PopupBlockerSettings = { ...prefs.popupBlocker, trustedOrigins: merged };
    PreferenceStore.update({ popupBlocker: next, popupBlockerSeeded: true });
    return next;
  }

  static get(): PopupBlockerSettings {
    const s = PopupBlockerManager.settings;
    return { enabled: s.enabled, showNotifications: s.showNotifications, trustedOrigins: [...s.trustedOrigins] };
  }

  /** Persist + apply a settings patch. Returns the stored settings. */
  static update(patch: Partial<PopupBlockerSettings>): PopupBlockerSettings {
    const next: PopupBlockerSettings = { ...PopupBlockerManager.settings, ...patch };
    PopupBlockerManager.settings = next;
    PreferenceStore.update({ popupBlocker: next });
    return PopupBlockerManager.get();
  }

  /** Add an origin to the trust allowlist (its future popups pass). No-op if empty/already trusted. */
  static trustOrigin(origin: string): void {
    const s = PopupBlockerManager.settings;
    if (origin.length === 0 || s.trustedOrigins.includes(origin)) return;
    PopupBlockerManager.update({ trustedOrigins: [...s.trustedOrigins, origin] });
  }

  /** Returns the most-recent blocked-popup events this session (newest first, max 20). */
  static getRecentRequests(): PopupBlockerRequest[] {
    return [...PopupBlockerManager.recentRequests];
  }

  /** Whether a popup from `sourceOrigin` should be blocked (strict: block unless the origin is trusted). */
  static shouldBlock(sourceOrigin: string): boolean {
    const s = PopupBlockerManager.settings;
    return s.enabled && !s.trustedOrigins.includes(sourceOrigin);
  }

  /** Raise the "pop-up blocked" notification with the four inline actions (if notifications are on). */
  static onBlocked(sourceOrigin: string, popupUrl: string): void {
    const entry: PopupBlockerRequest = {
      id: `popup:${sourceOrigin}:${popupUrl}`,
      sourceOrigin,
      popupUrl,
      blockedAt: Date.now(),
    };
    PopupBlockerManager.recentRequests.unshift(entry);
    if (PopupBlockerManager.recentRequests.length > 20) PopupBlockerManager.recentRequests.pop();
    if (!PopupBlockerManager.settings.showNotifications) return;
    const t = pick(popupBlockerDict, mainLocale());
    NotificationHost.push({
      source: 'site',
      kind: 'warning',
      title: t.blockedTitle,
      body: popupUrl,
      origin: sourceOrigin,
      channels: ['toast', 'center'],
      dedupeKey: `popup:${sourceOrigin}:${popupUrl}`,
      actions: [
        { id: 'allow', label: t.allow, type: 'open_url', url: popupUrl },
        { id: 'background', label: t.background, type: 'open_url_background', url: popupUrl },
        { id: 'redirect', label: t.redirect, type: 'navigate_current', url: popupUrl },
        { id: 'trust', label: t.trust, type: 'trust_origin', url: popupUrl },
      ],
    });
  }
}
