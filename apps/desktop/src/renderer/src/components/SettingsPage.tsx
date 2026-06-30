import { useEffect, useState } from 'react';
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

  return (
    <main className="mx-auto max-w-2xl space-y-6 px-6 py-8">
      <h2 className="text-lg font-semibold text-text-primary">{s.title}</h2>

      {feedback && (
        <AlertBanner key={feedbackKey} variant={feedback.variant} message={feedback.message} />
      )}

      {/* Providers & API keys */}
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

      {/* Appearance */}
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

      {/* Language */}
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

      {/* Privacy & telemetry */}
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

      {/* Cost & performance — the cost-saver local-model toggle */}
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
    </main>
  );
}
