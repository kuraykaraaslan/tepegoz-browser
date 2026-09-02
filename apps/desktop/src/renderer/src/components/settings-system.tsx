import { useState } from 'react';
import { settingsDict } from '@tepegoz/settings-ui';
import { Button, Card, Toggle } from '@tepegoz/ui';
import { useT } from '@tepegoz/i18n/react';
import type { Preferences } from '@tepegoz/desktop-ipc';
import { CrossLink } from './settings-shared';

/**
 * System — the machine-level behaviour that is genuinely system-level.
 *
 * Another `ComingSoonCard` that was advertising shipped work: of the three things it promised, "launch
 * at startup" had been a working preference under System tray & power and "proxy settings" were the
 * whole Network privacy page. Hardware acceleration was the one real gap, so it is the one new control
 * here; the other two are links to where they actually live.
 *
 * The restart prompt is not politeness. Chromium decides GPU compositing once, before `whenReady`
 * (`hardware-acceleration-boot.ts`), so a toggle that claimed to take effect immediately would be
 * describing something that had not happened.
 */
export function SystemSection({
  prefs,
  setPref,
}: {
  prefs: Preferences;
  setPref: (patch: Partial<Preferences>) => void;
}) {
  const s = useT(settingsDict);
  const t = s.system;
  // Only shown after a change in THIS session: on load the running app already matches the stored
  // value, and a permanent "restart needed" banner would be noise that teaches people to ignore it.
  const [restartNeeded, setRestartNeeded] = useState(false);

  return (
    <div className="space-y-6">
      <Card title={t.title} subtitle={t.subtitle}>
        <Toggle
          id="hardware-acceleration"
          label={t.hardwareAcceleration}
          description={t.hardwareAccelerationDesc}
          checked={prefs.hardwareAccelerationEnabled}
          onChange={(value) => {
            setPref({ hardwareAccelerationEnabled: value });
            setRestartNeeded(true);
          }}
        />
        <div className="mt-4">
          <Toggle
            id="crash-reporting"
            label={t.crashReporting}
            description={t.crashReportingDesc}
            checked={prefs.crashReportingEnabled}
            onChange={(value) => {
              setPref({ crashReportingEnabled: value });
              setRestartNeeded(true);
            }}
          />
        </div>
        {restartNeeded && (
          <div className="mt-4 flex flex-wrap items-center gap-3 rounded-md border border-warning bg-warning-subtle px-3 py-2">
            <p className="min-w-0 flex-1 text-xs text-warning-fg">{t.restartRequired}</p>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                window.tepegoz.relaunchApp();
              }}
            >
              {t.restartNow}
            </Button>
          </div>
        )}
      </Card>

      <Card title={t.elsewhereTitle} subtitle={t.elsewhereHint}>
        <ul className="space-y-2">
          <li>
            <CrossLink sectionId="system-tray">{t.linkLaunchAtLogin}</CrossLink>
          </li>
          <li>
            <CrossLink sectionId="network-privacy">{t.linkProxy}</CrossLink>
          </li>
        </ul>
      </Card>
    </div>
  );
}
