import { useEffect, useState } from 'react';
import { SettingsLayout, type SettingsSection } from '@tepegoz/settings-ui';
import { AlertBanner, Badge, Button, Card, Input, Toggle } from '@tepegoz/ui';
import type { Resources } from '@tepegoz/i18n';
import type {
  CredentialsStatus,
  LocalePref,
  Preferences,
  ProviderId,
  ThemePref,
} from '../../../shared/ipc-contract';

const PROVIDERS: readonly ProviderId[] = ['anthropic', 'openai', 'gemini'];
const THEMES: readonly ThemePref[] = ['system', 'light', 'dark'];
const LOCALES: readonly LocalePref[] = ['system', 'en', 'tr'];

const ICON = 'h-4 w-4';
const IconKey = () => (
  <svg className={ICON} viewBox="0 0 16 16" aria-hidden="true">
    <circle cx="5.5" cy="5.5" r="3" fill="none" stroke="currentColor" strokeWidth="1.3" />
    <path d="M7.7 7.7 L13 13 M11 11 l1.5-1.5 M12.5 12.5 l1-1" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
  </svg>
);
const IconPalette = () => (
  <svg className={ICON} viewBox="0 0 16 16" aria-hidden="true">
    <path d="M8 2a6 6 0 1 0 0 12c1 0 1.5-.8 1-1.6-.5-.9.2-1.9 1.2-1.9H12a2 2 0 0 0 2-2A6 6 0 0 0 8 2Z" fill="none" stroke="currentColor" strokeWidth="1.2" />
    <circle cx="5.5" cy="6" r=".9" fill="currentColor" />
    <circle cx="8" cy="4.5" r=".9" fill="currentColor" />
    <circle cx="10.5" cy="6" r=".9" fill="currentColor" />
  </svg>
);
const IconGlobe = () => (
  <svg className={ICON} viewBox="0 0 16 16" aria-hidden="true">
    <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="1.2" />
    <path d="M2 8h12 M8 2c2 2 2 10 0 12 M8 2c-2 2-2 10 0 12" fill="none" stroke="currentColor" strokeWidth="1.1" />
  </svg>
);
const IconShield = () => (
  <svg className={ICON} viewBox="0 0 16 16" aria-hidden="true">
    <path d="M8 2 3 4v4c0 3 2 5 5 6 3-1 5-3 5-6V4L8 2Z" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
  </svg>
);
const IconGauge = () => (
  <svg className={ICON} viewBox="0 0 16 16" aria-hidden="true">
    <path d="M3 12a5 5 0 1 1 10 0" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    <path d="M8 12 10.5 7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
  </svg>
);
const IconGear = () => (
  <svg className="h-5 w-5" viewBox="0 0 16 16" aria-hidden="true">
    <circle cx="8" cy="8" r="2.2" fill="none" stroke="currentColor" strokeWidth="1.4" />
    <path
      d="M8 1.5 v2 M8 12.5 v2 M1.5 8 h2 M12.5 8 h2 M3.4 3.4 l1.4 1.4 M11.2 11.2 l1.4 1.4 M12.6 3.4 l-1.4 1.4 M4.8 11.2 l-1.4 1.4"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
    />
  </svg>
);

interface SettingsPageProps {
  t: Resources;
  prefs: Preferences;
  status: CredentialsStatus;
  onUpdatePrefs: (patch: Partial<Preferences>) => Promise<void>;
  onSetKey: (provider: ProviderId, apiKey: string) => Promise<void>;
  onRemoveKey: (provider: ProviderId) => Promise<void>;
}

export function SettingsPage({
  t,
  prefs,
  status,
  onUpdatePrefs,
  onSetKey,
  onRemoveKey,
}: SettingsPageProps) {
  const s = t.settings;
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState<{ variant: 'success' | 'error'; message: string } | null>(
    null,
  );
  const [feedbackKey, setFeedbackKey] = useState(0);

  function notify(variant: 'success' | 'error', message: string): void {
    setFeedback({ variant, message });
    setFeedbackKey((k) => k + 1);
  }

  // Transient feedback auto-dismisses — no manual close button (avoids a non-localized control).
  useEffect(() => {
    if (feedbackKey === 0) return undefined;
    const id = setTimeout(() => {
      setFeedback(null);
    }, 4000);
    return () => {
      clearTimeout(id);
    };
  }, [feedbackKey]);

  const themeLabel: Record<ThemePref, string> = {
    system: s.themeSystem,
    light: s.themeLight,
    dark: s.themeDark,
  };
  // Language endonyms are conventionally shown untranslated.
  const localeLabel: Record<LocalePref, string> = { system: s.langSystem, en: 'English', tr: 'Türkçe' };

  async function saveKey(provider: ProviderId): Promise<void> {
    const key = (drafts[provider] ?? '').trim();
    if (key.length === 0) return;
    try {
      await onSetKey(provider, key);
      setDrafts((d) => ({ ...d, [provider]: '' }));
      notify('success', s.keySaved);
    } catch {
      notify('error', t.errors.upstreamDown);
    }
  }

  async function removeKey(provider: ProviderId): Promise<void> {
    try {
      await onRemoveKey(provider);
      notify('success', s.keyRemoved);
    } catch {
      notify('error', t.errors.upstreamDown);
    }
  }

  function setPref(patch: Partial<Preferences>): void {
    void onUpdatePrefs(patch).catch(() => {
      notify('error', t.errors.upstreamDown);
    });
  }

  const sections: SettingsSection[] = [
    {
      id: 'providers',
      label: s.providersTitle,
      icon: <IconKey />,
      searchText: `${s.providersTitle} ${s.providersSubtitle} ${s.apiKey} ${PROVIDERS.map((p) => s.providerNames[p]).join(' ')}`,
      content: (
        <Card title={s.providersTitle} subtitle={s.providersSubtitle}>
          {!status.encryptionAvailable && (
            <AlertBanner variant="error" message={s.encryptionUnavailable} className="mb-4" />
          )}
          <div className="space-y-5">
            {PROVIDERS.map((p) => {
              const isSet = status.providers[p];
              const draft = drafts[p] ?? '';
              return (
                <div key={p} className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-text-primary">{s.providerNames[p]}</span>
                    <Badge variant={isSet ? 'success' : 'neutral'} dot>
                      {isSet ? s.keySet : s.keyNotSet}
                    </Badge>
                  </div>
                  <Input
                    id={`key-${p}`}
                    label={s.apiKey}
                    type="password"
                    placeholder={s.apiKeyPlaceholder}
                    value={draft}
                    disabled={!status.encryptionAvailable}
                    showPasswordLabel={t.common.showPassword}
                    hidePasswordLabel={t.common.hidePassword}
                    onChange={(e) => {
                      const { value } = e.target;
                      setDrafts((d) => ({ ...d, [p]: value }));
                    }}
                  />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      disabled={!status.encryptionAvailable || draft.trim().length === 0}
                      onClick={() => void saveKey(p)}
                    >
                      {t.common.save}
                    </Button>
                    {isSet && (
                      <Button size="sm" variant="outline" onClick={() => void removeKey(p)}>
                        {s.remove}
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      ),
    },
    {
      id: 'appearance',
      label: s.appearanceTitle,
      icon: <IconPalette />,
      searchText: `${s.appearanceTitle} ${s.theme} ${s.themeSystem} ${s.themeLight} ${s.themeDark}`,
      content: (
        <Card title={s.appearanceTitle}>
          <p className="mb-2 text-sm font-medium text-text-primary">{s.theme}</p>
          <div className="flex gap-2">
            {THEMES.map((th) => (
              <Button
                key={th}
                size="sm"
                variant={prefs.theme === th ? 'primary' : 'outline'}
                onClick={() => {
                  setPref({ theme: th });
                }}
              >
                {themeLabel[th]}
              </Button>
            ))}
          </div>
        </Card>
      ),
    },
    {
      id: 'language',
      label: s.languageTitle,
      icon: <IconGlobe />,
      searchText: `${s.languageTitle}`,
      content: (
        <Card title={s.languageTitle}>
          <div className="flex gap-2">
            {LOCALES.map((lc) => (
              <Button
                key={lc}
                size="sm"
                variant={prefs.locale === lc ? 'primary' : 'outline'}
                onClick={() => {
                  setPref({ locale: lc });
                }}
              >
                {localeLabel[lc]}
              </Button>
            ))}
          </div>
        </Card>
      ),
    },
    {
      id: 'privacy',
      label: s.privacyTitle,
      icon: <IconShield />,
      searchText: `${s.privacyTitle} ${s.telemetry} ${s.telemetryDesc}`,
      content: (
        <Card title={s.privacyTitle}>
          <Toggle
            id="telemetry"
            label={s.telemetry}
            description={s.telemetryDesc}
            checked={prefs.telemetryEnabled}
            onChange={(v) => {
              setPref({ telemetryEnabled: v });
            }}
          />
        </Card>
      ),
    },
    {
      id: 'cost',
      label: s.costTitle,
      icon: <IconGauge />,
      searchText: `${s.costTitle} ${s.localModel} ${s.localModelDesc}`,
      content: (
        <Card title={s.costTitle}>
          <Toggle
            id="local-model"
            label={s.localModel}
            description={s.localModelDesc}
            checked={prefs.useLocalModelForSimpleTasks}
            onChange={(v) => {
              setPref({ useLocalModelForSimpleTasks: v });
            }}
          />
        </Card>
      ),
    },
  ];

  return (
    <SettingsLayout
      labels={{ title: s.title, search: s.search, noResults: s.noResults }}
      titleIcon={<IconGear />}
      sections={sections}
      banner={
        feedback ? (
          <AlertBanner key={feedbackKey} variant={feedback.variant} message={feedback.message} />
        ) : null
      }
    />
  );
}
