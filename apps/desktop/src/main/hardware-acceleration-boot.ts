import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { App } from 'electron';
import { Logger } from '@tepegoz/libs';

/**
 * Startup application of the GPU-compositing preference.
 *
 * `app.disableHardwareAcceleration()` is only honoured before `whenReady`, and `PreferenceStore.init`
 * runs after it — the same ordering problem `chromium-flags-boot.ts` already solves, and solved the
 * same way: read `preferences.json` directly, treat it as untrusted, and fall back to the default on
 * anything unexpected.
 *
 * The default is ON and the fallback is ON, deliberately. A corrupt or half-written preferences file
 * must not be able to silently drop a user into software rendering — the failure would look like the
 * whole browser got slow, with nothing on screen connecting it to a setting.
 */
export function applyHardwareAccelerationPreference(app: App): void {
  let enabled = true;
  try {
    const text = readFileSync(join(app.getPath('userData'), 'preferences.json'), 'utf8');
    const doc = JSON.parse(text) as { hardwareAccelerationEnabled?: unknown };
    if (doc.hardwareAccelerationEnabled === false) enabled = false;
  } catch {
    return;
  }
  if (enabled) return;
  app.disableHardwareAcceleration();
  Logger.info('Hardware acceleration disabled by preference');
}
