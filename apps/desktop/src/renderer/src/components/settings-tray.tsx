import { settingsDict } from '@tepegoz/settings-ui';
import { Card, Input, Toggle } from '@tepegoz/ui';
import { useT } from '@tepegoz/i18n/react';
import type { Preferences } from '@tepegoz/desktop-ipc';
import { useCommitOnPause } from '../lib/use-commit-on-pause';
import { CrossLink } from './settings-shared';

/** The bounds `PreferencesSchema` enforces; repeated here so the field can EXPLAIN a refusal rather
 *  than silently discarding what was typed, which is what the bare `if (in range)` guard used to do. */
const MIN_IDLE_MINUTES = 1;
const MAX_IDLE_MINUTES = 1440;

/**
 * System tray & power — what Tepegöz does while you are not looking at it.
 *
 * Startup mode, the kiosk address and launch-at-login used to sit here too; they moved to
 * Preferences → On startup, the page named after them. What is left is one coherent subject: staying
 * alive in the tray, and what that costs in memory and battery.
 */
export function TraySection({
  prefs,
  setPref,
}: {
  prefs: Preferences;
  setPref: (patch: Partial<Preferences>) => void;
}) {
  const s = useT(settingsDict);
  const t = s.tray;

  const idle = useCommitOnPause(String(prefs.tabDiscardIdleMinutes), (value) => {
    const n = Number(value);
    if (!Number.isFinite(n)) return;
    const rounded = Math.round(n);
    if (rounded < MIN_IDLE_MINUTES || rounded > MAX_IDLE_MINUTES) return;
    setPref({ tabDiscardIdleMinutes: rounded });
  });
  const idleNumber = Number(idle.draft);
  const idleInvalid =
    idle.draft.trim() !== '' &&
    (!Number.isFinite(idleNumber) ||
      idleNumber < MIN_IDLE_MINUTES ||
      idleNumber > MAX_IDLE_MINUTES);

  return (
    <Card title={t.title}>
      <div className="space-y-5">
        <Toggle
          id="close-to-tray"
          label={t.closeToTray}
          description={t.closeToTrayDesc}
          checked={prefs.closeToTray}
          onChange={(v) => {
            setPref({ closeToTray: v });
          }}
        />
        <Toggle
          id="keep-awake-in-tray"
          label={t.keepAwake}
          description={t.keepAwakeDesc}
          checked={prefs.keepAwakeInTray}
          onChange={(v) => {
            setPref({ keepAwakeInTray: v });
          }}
        />
        <Toggle
          id="pause-tasks-on-sleep"
          label={t.pauseOnSleep}
          description={t.pauseOnSleepDesc}
          checked={prefs.pauseTasksOnSleep}
          onChange={(v) => {
            setPref({ pauseTasksOnSleep: v });
          }}
        />
        <Toggle
          id="tab-discard-enabled"
          label={t.tabDiscard}
          description={t.tabDiscardDesc}
          checked={prefs.tabDiscardEnabled}
          onChange={(v) => {
            setPref({ tabDiscardEnabled: v });
          }}
        />
        {prefs.tabDiscardEnabled && (
          <div className="max-w-[14rem]">
            <Input
              id="tab-discard-idle-minutes"
              type="number"
              min={MIN_IDLE_MINUTES}
              max={MAX_IDLE_MINUTES}
              label={t.tabDiscardIdleMinutes}
              value={idle.draft}
              {...(idleInvalid
                ? {
                    error: s.startup.rangeInvalid
                      .replace('{min}', String(MIN_IDLE_MINUTES))
                      .replace('{max}', String(MAX_IDLE_MINUTES)),
                  }
                : {})}
              onChange={(e) => {
                idle.set(e.target.value);
              }}
              onBlur={idle.flush}
            />
          </div>
        )}
        <p className="text-xs text-text-secondary">
          <CrossLink sectionId="preferences">{s.startup.movedHere}</CrossLink>
        </p>
      </div>
    </Card>
  );
}
