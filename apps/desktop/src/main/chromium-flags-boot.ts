import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { App } from 'electron';
import {
  KEEP_RENDERING_SWITCHES,
  Logger,
  mergeChromiumSwitches,
  resolveChromiumFlagSwitches,
} from '@tepegoz/libs';
import { ChromiumFlagOverridesSchema, type ChromiumFlagOverrides } from '@tepegoz/shared-types';

/**
 * Startup application of Chromium command-line switches — the app's own baseline
 * ({@link KEEP_RENDERING_SWITCHES}) plus the user's allowlisted flag overrides (Developer settings,
 * dev-only — [ADR-0041](../../../docs/adr/0041-developer-settings-surface.md)).
 *
 * Both must be set here, before `app.whenReady()`: Chromium reads switches once, at startup. They are
 * merged so `enable-features` / `disable-features` are each appended exactly once — `base::CommandLine`
 * keeps only the last value for a repeated switch, so two separate appends would silently drop a list.
 *
 * The flags are read straight from `preferences.json` rather than through `PreferenceStore.init`, which
 * runs after `whenReady`. The file is untrusted: a missing/corrupt file, or a `chromiumFlags` value
 * that fails the allowlist schema, yields no overrides — the same fallback `PreferenceStore` uses.
 */
export function readPersistedChromiumFlags(userDataDir: string): ChromiumFlagOverrides {
  let rawFlags: unknown = {};
  try {
    const text = readFileSync(join(userDataDir, 'preferences.json'), 'utf8');
    const doc = JSON.parse(text) as { chromiumFlags?: unknown };
    rawFlags = doc.chromiumFlags ?? {};
  } catch {
    return {};
  }
  const parsed = ChromiumFlagOverridesSchema.safeParse(rawFlags);
  return parsed.success ? parsed.data : {};
}

/** Append the merged baseline + user-flag switches to `app.commandLine`. Call once, before whenReady,
 *  after the userData path has been pinned. */
export function applyChromiumSwitches(app: App): void {
  const overrides = readPersistedChromiumFlags(app.getPath('userData'));
  const switches = mergeChromiumSwitches(
    KEEP_RENDERING_SWITCHES,
    resolveChromiumFlagSwitches(overrides),
  );
  for (const sw of switches) {
    if (sw.value === undefined) app.commandLine.appendSwitch(sw.name);
    else app.commandLine.appendSwitch(sw.name, sw.value);
  }
  const enabled = Object.keys(overrides).filter((id) => overrides[id as keyof ChromiumFlagOverrides]);
  if (enabled.length > 0) Logger.info('Chromium flag overrides applied', { flags: enabled });
}
