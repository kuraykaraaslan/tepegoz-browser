import { useMemo, useRef } from 'react';
import { settingsDict, type SettingsStrings } from '@tepegoz/settings-ui';
import { Badge, Card, Toggle } from '@tepegoz/ui';
import { useT } from '@tepegoz/i18n/react';
import { CHROMIUM_FLAG_ALLOWLIST, type ChromiumFlagId } from '@tepegoz/shared-types';
import type { Preferences } from '@tepegoz/desktop-ipc';

export interface ChromiumFlagsCardProps {
  prefs: Preferences;
  onUpdatePrefs: (patch: Partial<Preferences>) => Promise<void>;
}

/**
 * The dev-only `chrome://flags` analog (ADR-0041): a toggle per allowlisted Chromium flag. There is no
 * free-form entry — the list IS `CHROMIUM_FLAG_ALLOWLIST`, and the persisted patch is re-validated by
 * the preferences schema against that same allowlist. A change needs a relaunch (Chromium reads
 * switches only at startup), so we show a hint once the current selection diverges from the one this
 * process booted with.
 */
export function ChromiumFlagsCard({ prefs, onUpdatePrefs }: ChromiumFlagsCardProps) {
  const s = useT(settingsDict);
  const flags = prefs.chromiumFlags;
  // The selection this renderer first saw — i.e. what the running process booted with. Frozen on mount.
  const booted = useRef(flags);
  const needsRelaunch = useMemo(
    () => CHROMIUM_FLAG_ALLOWLIST.some((f) => (booted.current[f.id] ?? false) !== (flags[f.id] ?? false)),
    [flags],
  );

  function setFlag(id: ChromiumFlagId, enabled: boolean): void {
    void onUpdatePrefs({ chromiumFlags: { ...flags, [id]: enabled } });
  }

  return (
    <Card title={s.developerFlagsTitle} subtitle={s.developerFlagsDesc}>
      <div className="space-y-4 px-6 pb-5 pt-1">
        {needsRelaunch && (
          <p className="rounded-md bg-warning-subtle px-3 py-2 text-xs text-warning-fg">
            {s.developerFlagsRelaunchHint}
          </p>
        )}
        <ul className="space-y-4">
          {CHROMIUM_FLAG_ALLOWLIST.map((f) => {
            const copy = flagCopy(s, f.id);
            return (
              <li key={f.id} className="space-y-1">
                <div className="flex items-center gap-2">
                  <code className="rounded bg-surface-sunken px-1.5 py-0.5 text-xs text-text-secondary">
                    {f.id}
                  </code>
                  {f.experimental && (
                    <Badge variant="warning">{s.developerFlagsExperimental}</Badge>
                  )}
                </div>
                <Toggle
                  id={`chromium-flag-${f.id}`}
                  label={copy.name}
                  description={copy.desc}
                  checked={flags[f.id] === true}
                  onChange={(v) => setFlag(f.id, v)}
                />
              </li>
            );
          })}
        </ul>
      </div>
    </Card>
  );
}

/**
 * Flag id → localized name/description. An exhaustive `switch` on the `ChromiumFlagId` union: adding a
 * flag to the allowlist without adding its copy here is a compile error, which is the completeness
 * guarantee this surface needs.
 */
function flagCopy(s: SettingsStrings, id: ChromiumFlagId): { name: string; desc: string } {
  const d = s.developerFlagName;
  switch (id) {
    case 'force-dark-mode':
      return { name: d.forceDarkMode, desc: d.forceDarkModeDesc };
    case 'parallel-downloading':
      return { name: d.parallelDownloading, desc: d.parallelDownloadingDesc };
    case 'overlay-scrollbars':
      return { name: d.overlayScrollbars, desc: d.overlayScrollbarsDesc };
    case 'force-reduced-motion':
      return { name: d.forceReducedMotion, desc: d.forceReducedMotionDesc };
    case 'disable-gpu':
      return { name: d.disableGpu, desc: d.disableGpuDesc };
    case 'show-fps-counter':
      return { name: d.showFpsCounter, desc: d.showFpsCounterDesc };
  }
}
