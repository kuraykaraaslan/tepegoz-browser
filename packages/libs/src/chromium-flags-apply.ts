import {
  CHROMIUM_FLAG_ALLOWLIST,
  type ChromiumFlagApply,
  type ChromiumFlagDef,
  type ChromiumFlagId,
  type ChromiumFlagOverrides,
  enabledChromiumFlagIds,
} from '@tepegoz/shared-types';
import type { ChromiumSwitch } from './chromium-switches';

/**
 * Turn the user's allowlisted flag overrides into Chromium command-line switches, and merge them with
 * the app's own baseline switches so `enable-features` / `disable-features` are each appended exactly
 * once. `base::CommandLine` keeps only the LAST value for a repeated switch name, so appending
 * `disable-features` twice (once for the app baseline, once for a user flag) would silently drop one
 * list — this module is the single place that flattens both into one comma-joined value.
 *
 * Pure string data, no Electron import: the caller applies the result via `app.commandLine.appendSwitch`
 * (see `apps/desktop` main) or `electron.launch({ args })` (eval harness), exactly like
 * {@link ChromiumSwitch}.
 */

const ALLOWLIST: readonly ChromiumFlagDef[] = CHROMIUM_FLAG_ALLOWLIST;

/** The switches one enabled flag id contributes (before feature-list merging). */
function switchesForFlag(id: ChromiumFlagId): ChromiumSwitch[] {
  const def = ALLOWLIST.find((f) => f.id === id);
  if (def === undefined) return [];
  const apply: ChromiumFlagApply = def.apply;
  switch (apply.kind) {
    case 'switch':
      return [{ name: apply.switch }];
    case 'switch-value':
      return [{ name: apply.switch, value: apply.value }];
    case 'enable-feature':
      return [{ name: 'enable-features', value: apply.feature }];
    case 'disable-feature':
      return [{ name: 'disable-features', value: apply.feature }];
  }
}

/**
 * Merge switch groups so `enable-features` and `disable-features` collapse to one entry each (values
 * concatenated, comma-separated, de-duplicated, order preserved). Every other switch passes through in
 * order; a later exact duplicate (same name + value) is dropped.
 */
export function mergeChromiumSwitches(
  ...groups: readonly (readonly ChromiumSwitch[])[]
): ChromiumSwitch[] {
  const featureLists = new Map<string, string[]>();
  const passthrough: ChromiumSwitch[] = [];
  const seen = new Set<string>();

  for (const group of groups) {
    for (const sw of group) {
      if (sw.name === 'enable-features' || sw.name === 'disable-features') {
        const list = featureLists.get(sw.name) ?? [];
        for (const feature of (sw.value ?? '').split(',')) {
          const trimmed = feature.trim();
          if (trimmed.length > 0 && !list.includes(trimmed)) list.push(trimmed);
        }
        featureLists.set(sw.name, list);
        continue;
      }
      const key = `${sw.name}=${sw.value ?? ''}`;
      if (seen.has(key)) continue;
      seen.add(key);
      passthrough.push(sw);
    }
  }

  const merged: ChromiumSwitch[] = [...passthrough];
  for (const [name, list] of featureLists) {
    if (list.length > 0) merged.push({ name, value: list.join(',') });
  }
  return merged;
}

/** The switches contributed by the enabled flags in `overrides`, feature lists already merged. */
export function resolveChromiumFlagSwitches(overrides: ChromiumFlagOverrides): ChromiumSwitch[] {
  const groups = enabledChromiumFlagIds(overrides).map(switchesForFlag);
  return mergeChromiumSwitches(...groups);
}
