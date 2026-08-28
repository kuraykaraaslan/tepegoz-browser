import { settingsDict } from '@tepegoz/settings-ui';
import { Card, Input, Toggle } from '@tepegoz/ui';
import { useT } from '@tepegoz/i18n/react';
import { isNavigableWebUrl, normalizeWebUrlInput } from '@tepegoz/shared-types';
import type { Preferences, StartupMode } from '@tepegoz/desktop-ipc';
import { useCommitOnPause } from '../lib/use-commit-on-pause';
import { OptionList } from './settings-shared';

/**
 * On startup — what happens when Tepegöz launches.
 *
 * These three preferences were real and working, but they lived under "System tray & power" while the
 * page a user actually opens to change them, Preferences → On startup, was a `ComingSoonCard`. Someone
 * looking for startup behaviour found a placeholder saying it did not exist yet. Moving the controls to
 * the page named after them is the whole fix; nothing about how they work changed.
 *
 * Closing-to-tray, keep-awake, sleep and tab discarding stay behind — they are power behaviour, not
 * startup behaviour, and they are what that page is now only about.
 */
export function StartupSection({
  prefs,
  setPref,
}: {
  prefs: Preferences;
  setPref: (patch: Partial<Preferences>) => void;
}) {
  const s = useT(settingsDict);
  const t = s.tray;
  const st = s.startup;

  // Committed on pause/blur rather than per keystroke: `prefs:set` validates, writes to disk and runs
  // this key's reconcilers, and a URL is ~25 keystrokes.
  const kiosk = useCommitOnPause(prefs.kioskUrl, (value) => {
    const normalized = normalizeWebUrlInput(value);
    // An address that cannot be navigated is not stored: `PreferencesSchema` would refuse it anyway,
    // and letting the write fail silently would leave the field showing a value that is not saved.
    if (normalized === '' || isNavigableWebUrl(normalized)) setPref({ kioskUrl: normalized });
  });
  const kioskInvalid =
    kiosk.draft.trim() !== '' && !isNavigableWebUrl(normalizeWebUrlInput(kiosk.draft));

  const modeOptions: { value: StartupMode; title: string; desc: string }[] = [
    { value: 'window', title: t.modeWindow, desc: st.modeWindowDesc },
    { value: 'background', title: t.modeBackground, desc: st.modeBackgroundDesc },
    { value: 'kiosk', title: t.modeKiosk, desc: st.modeKioskDesc },
  ];

  return (
    <Card title={st.title} subtitle={t.startupModeDesc}>
      <div className="space-y-5">
        <Toggle
          id="launch-at-login"
          label={t.launchAtLogin}
          description={t.launchAtLoginDesc}
          checked={prefs.launchAtLogin}
          onChange={(value) => {
            setPref({ launchAtLogin: value });
          }}
        />

        <div>
          <p className="mb-2 text-sm font-medium text-text-primary">{t.startupMode}</p>
          <OptionList<StartupMode>
            name="startup-mode"
            value={prefs.startupMode}
            options={modeOptions}
            onChange={(mode) => {
              setPref({ startupMode: mode });
            }}
          />
        </div>

        {prefs.startupMode === 'kiosk' && (
          <Input
            id="kiosk-url"
            type="url"
            label={t.kioskUrl}
            hint={st.kioskUrlHint}
            placeholder={t.kioskUrlPlaceholder}
            value={kiosk.draft}
            {...(kioskInvalid ? { error: st.urlInvalid } : {})}
            onChange={(e) => {
              kiosk.set(e.target.value);
            }}
            onBlur={kiosk.flush}
          />
        )}
      </div>
    </Card>
  );
}
