import { BrowserWindow } from 'electron';
import { IpcChannels, PUBLIC_SETTING_KEYS, type PublicSettings } from '@tepegoz/desktop-ipc';
import PreferenceStore, { PublicSettingsSchema } from '@tepegoz/preferences';
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

/** Push the current snapshot to every app chrome window (main + open popups). Browsed pages are
 *  WebContentsViews, not BrowserWindows, so they are never reached. Call after any preference change. */
export function broadcastPublicSettings(): void {
  const settings = project();
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(IpcChannels.publicSettingsChanged, settings);
  }
}
