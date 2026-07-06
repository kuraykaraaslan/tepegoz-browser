import { pick, type Locale } from '@tepegoz/i18n';
import { defineActionInterceptors, type ActionInterceptorSet } from '@tepegoz/extension-sdk';
import type { NotificationDraft } from '@tepegoz/notifications';
import { popupBlockerDict } from './i18n';
import { DEFAULT_TRUSTED_POPUP_ORIGINS } from './default-trusted-origins';
import { popupBlockerManifest } from './manifest';
import type { PopupBlockerRequest, PopupBlockerSettings } from './types';

/**
 * Host side of the Popup Blocker (strict) extension (ADR-0022). Owns the settings state, the
 * trusted-origin allowlist, the block decision, and the "blocked" notification — everything the
 * desktop app used to hardcode in `apps/desktop/src/main/popup-blocker.ts`. The package stays
 * Electron-free: preference persistence and notification delivery are injected as {@link
 * PopupBlockerPorts} by the main-process wiring (`apps/desktop/src/main/index.ts`), matching the
 * pure-logic-plus-wiring split already used by `mcp/config-source.ts` and `capabilities.ts`.
 *
 * `shouldBlock` is registered as a `popup:open` interceptor via {@link defineActionInterceptors} —
 * `TabManager` never imports this package; it only asks the generic `ActionInterceptorService`
 * "should this be blocked?", oblivious to which (if any) extension answered.
 */
export interface PopupBlockerPorts {
  getPrefs(): { popupBlocker: PopupBlockerSettings; popupBlockerSeeded: boolean };
  updatePrefs(patch: { popupBlocker?: PopupBlockerSettings; popupBlockerSeeded?: boolean }): void;
  /** Raise a notification (see `@tepegoz/notifications`'s `NotificationDraft`). */
  pushNotification(draft: NotificationDraft): void;
  /** The current UI locale, for the blocked-popup notification's strings. */
  locale(): Locale;
}

export interface PopupBlockerHost {
  /** This extension's action interceptors — pass to `ActionInterceptorService.provide` at startup. */
  interceptors: ActionInterceptorSet;
  /** Seed the curated default trusted origins on first run. Call once, before any tab opens. */
  init(): void;
  get(): PopupBlockerSettings;
  /** Persist + apply a settings patch. Returns the stored settings. */
  update(patch: Partial<PopupBlockerSettings>): PopupBlockerSettings;
  /** Add an origin to the trust allowlist. No-op if empty/already trusted. */
  trustOrigin(origin: string): void;
  /** The most-recent blocked-popup events this session (newest first, max 20). */
  getRecentRequests(): PopupBlockerRequest[];
}

export function createPopupBlockerHost(ports: PopupBlockerPorts): PopupBlockerHost {
  let settings: PopupBlockerSettings = { enabled: true, showNotifications: true, trustedOrigins: [] };
  const recentRequests: PopupBlockerRequest[] = [];

  const get = (): PopupBlockerSettings => ({
    enabled: settings.enabled,
    showNotifications: settings.showNotifications,
    trustedOrigins: [...settings.trustedOrigins],
  });

  const update = (patch: Partial<PopupBlockerSettings>): PopupBlockerSettings => {
    settings = { ...settings, ...patch };
    ports.updatePrefs({ popupBlocker: settings });
    return get();
  };

  const trustOrigin = (origin: string): void => {
    if (origin.length === 0 || settings.trustedOrigins.includes(origin)) return;
    update({ trustedOrigins: [...settings.trustedOrigins, origin] });
  };

  const getRecentRequests = (): PopupBlockerRequest[] => [...recentRequests];

  /** True = block (strict: block unless the origin is trusted). The extension's own on/off toggle
   *  lives here; the ENABLED-EXTENSION gate is applied centrally by `ActionInterceptorSupervisor`. */
  const shouldBlock = (ctx: { sourceOrigin: string; url: string }): boolean =>
    settings.enabled && !settings.trustedOrigins.includes(ctx.sourceOrigin);

  /** Record the block + raise the "pop-up blocked" notification (four inline actions), if enabled. */
  const onBlocked = (ctx: { sourceOrigin: string; url: string }): void => {
    const entry: PopupBlockerRequest = {
      id: `popup:${ctx.sourceOrigin}:${ctx.url}`,
      sourceOrigin: ctx.sourceOrigin,
      popupUrl: ctx.url,
      blockedAt: Date.now(),
    };
    recentRequests.unshift(entry);
    if (recentRequests.length > 20) recentRequests.pop();
    if (!settings.showNotifications) return;
    const t = pick(popupBlockerDict, ports.locale());
    ports.pushNotification({
      source: 'site',
      kind: 'warning',
      title: t.blockedTitle,
      body: ctx.url,
      origin: ctx.sourceOrigin,
      channels: ['toast', 'center'],
      dedupeKey: entry.id,
      actions: [
        { id: 'allow', label: t.allow, type: 'open_url', url: ctx.url },
        { id: 'background', label: t.background, type: 'open_url_background', url: ctx.url },
        { id: 'redirect', label: t.redirect, type: 'navigate_current', url: ctx.url },
        { id: 'trust', label: t.trust, type: 'trust_origin', url: ctx.url },
      ],
    });
  };

  /** One-time seed: union the curated default trusted origins into the persisted allowlist and mark
   *  it seeded, so a user who later removes a default is respected (it is never re-added). */
  const init = (): void => {
    const prefs = ports.getPrefs();
    if (prefs.popupBlockerSeeded) {
      settings = prefs.popupBlocker;
      return;
    }
    const merged = [
      ...new Set([...prefs.popupBlocker.trustedOrigins, ...DEFAULT_TRUSTED_POPUP_ORIGINS]),
    ].slice(0, 500); // stay within the schema's trustedOrigins cap
    settings = { ...prefs.popupBlocker, trustedOrigins: merged };
    ports.updatePrefs({ popupBlocker: settings, popupBlockerSeeded: true });
  };

  const interceptors = defineActionInterceptors(popupBlockerManifest.id, [
    { actionType: 'popup:open', shouldBlock, onBlocked },
  ]);

  return { interceptors, init, get, update, trustOrigin, getRecentRequests };
}
