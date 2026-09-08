import { useRef } from 'react';
import { settingsDict } from '@tepegoz/settings-ui';
import { Badge, Card, Toggle } from '@tepegoz/ui';
import { useT } from '@tepegoz/i18n/react';
import { WEB_CONTENT_DEFAULTS } from '@tepegoz/shared-types/web-content-defaults';
import type { Preferences, WebContentDefaults } from '@tepegoz/desktop-ipc';

/**
 * The `webPreferences` every browsed tab view is born with (ADR-0041 Tier C/D). The four page-isolation
 * keys are read-only and locked by security policy — never a toggle. The two non-isolation keys are
 * editable and write the `webContentDefaults` preference; a change lands on a tab's next reload
 * (`browsedViewWebPreferences` applies it at view creation), so a "reload tabs to apply" hint shows
 * once the current selection diverges from what this window booted with.
 */
export function WebContentDefaultsCard({
  prefs,
  onUpdatePrefs,
}: {
  prefs: Preferences;
  onUpdatePrefs: (patch: Partial<Preferences>) => Promise<void>;
}) {
  const s = useT(settingsDict);
  const current = prefs.webContentDefaults;
  const booted = useRef(current);
  const changed =
    booted.current.plugins !== current.plugins ||
    booted.current.backgroundThrottling !== current.backgroundThrottling;

  const set = (key: keyof WebContentDefaults, value: boolean): void => {
    void onUpdatePrefs({ webContentDefaults: { ...current, [key]: value } });
  };

  return (
    <Card title={s.webContentDefaultsTitle} subtitle={s.webContentDefaultsDesc}>
      <div className="space-y-3 px-6 pb-5 pt-1">
        {changed && (
          <p className="rounded-md bg-warning-subtle px-3 py-2 text-xs text-warning-fg">
            {s.webContentDefaultsReloadHint}
          </p>
        )}
        <ul className="divide-y divide-border">
          {WEB_CONTENT_DEFAULTS.map((d) => (
            <li key={d.key} className="flex items-center justify-between gap-3 py-2">
              <code className="text-xs text-text-primary">{d.key}</code>
              {d.locked ? (
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-text-secondary">{String(d.value)}</span>
                  <Badge variant="neutral">{s.webContentDefaultsLocked}</Badge>
                </div>
              ) : (
                <Toggle
                  id={`web-content-default-${d.key}`}
                  label={String(current[d.key])}
                  checked={current[d.key]}
                  onChange={(v) => set(d.key, v)}
                />
              )}
            </li>
          ))}
        </ul>
      </div>
    </Card>
  );
}
