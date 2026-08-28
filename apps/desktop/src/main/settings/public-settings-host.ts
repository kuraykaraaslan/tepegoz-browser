import { IpcChannels, PUBLIC_SETTING_KEYS, type PublicSettings } from '@tepegoz/desktop-ipc';
import PreferenceStore, { PublicSettingsSchema } from '@tepegoz/preferences';
import { broadcastToAppSurfaces } from '../lib/app-surfaces';
import { mainLocale } from '../lib/i18n-main';

/**
 * Main-process owner of the PUBLIC settings surface handed to extensions. Projects the full
 * `Preferences` down to the allowlisted-public keys ONLY (iterating `PUBLIC_SETTING_KEYS`, never
 * spreading raw prefs), zod-validates the projection (so a projection bug can't leak a private field),
 * and broadcasts changes to every app chrome window — mirroring `notification-host`'s broadcast seam.
 */
function project(): PublicSettings {
  const prefs = PreferenceStore.getAll();
  // Build from the allowlist only — a key that is not classified 'public' has no path into this object.
  const draft: Record<string, unknown> = { resolvedLocale: mainLocale() };
  for (const key of PUBLIC_SETTING_KEYS) {
    draft[key] = prefs[key];
  }
  // Boundary validation: the object schema also strips anything that isn't a declared public field.
  return PublicSettingsSchema.parse(draft);
}

/** The current public-settings snapshot (handler for `public-settings:get`). */
export function getPublicSettings(): PublicSettings {
  return project();
}

/**
 * Push the current snapshot to every app surface — the chrome windows AND the `tepegoz://` pages. Call
 * after any preference change.
 *
 * This used to iterate `BrowserWindow.getAllWindows()` only, which reads as "everything" and is not: a
 * `tepegoz://` page is a `WebContentsView` inside a tab, so every internal page subscribed to this
 * signal and never received it. The visible symptom was the theme — pick a colour anywhere but on the
 * settings page itself and the open settings page stayed in the OLD colour until it was reloaded, while
 * the chrome around it changed immediately. Locale had the same silent gap. `appSurfaceContents()` is
 * where "our own surfaces" is now answered once, for both kinds. Browsed pages are still never reached.
 */
export function broadcastPublicSettings(): void {
  broadcastToAppSurfaces(IpcChannels.publicSettingsChanged, project());
}
