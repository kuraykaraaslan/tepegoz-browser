import { useEffect, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faBell,
  faGauge,
  faGear,
  faGlobe,
  faKey,
  faPalette,
  faPlug,
  faShield,
} from '@fortawesome/free-solid-svg-icons';
import { SettingsLayout, settingsDict, type SettingsSection } from '@tepegoz/settings-ui';
import { AlertBanner, Badge, Button, Card, Input, Toggle } from '@tepegoz/ui';
import { coreDict } from '@tepegoz/i18n';
import { useT } from '@tepegoz/i18n/react';
import type {
  CredentialsStatus,
  LocalePref,
  McpServerState,
  McpServerStatusInfo,
  Preferences,
  ProviderId,
  ThemePref,
} from '@tepegoz/desktop-ipc';

const PROVIDERS: readonly ProviderId[] = ['anthropic', 'openai', 'gemini'];
const THEMES: readonly ThemePref[] = ['system', 'light', 'dark'];
const LOCALES: readonly LocalePref[] = ['system', 'en', 'tr'];

const ICON = 'h-4 w-4';
const IconKey = () => <FontAwesomeIcon icon={faKey} className={ICON} aria-hidden />;
const IconPalette = () => <FontAwesomeIcon icon={faPalette} className={ICON} aria-hidden />;
const IconGlobe = () => <FontAwesomeIcon icon={faGlobe} className={ICON} aria-hidden />;
const IconShield = () => <FontAwesomeIcon icon={faShield} className={ICON} aria-hidden />;
const IconGauge = () => <FontAwesomeIcon icon={faGauge} className={ICON} aria-hidden />;
const IconBell = () => <FontAwesomeIcon icon={faBell} className={ICON} aria-hidden />;
const IconPlug = () => <FontAwesomeIcon icon={faPlug} className={ICON} aria-hidden />;
const IconGear = () => <FontAwesomeIcon icon={faGear} className="h-5 w-5" aria-hidden />;

interface SettingsPageProps {
  prefs: Preferences;
  status: CredentialsStatus;
  onUpdatePrefs: (patch: Partial<Preferences>) => Promise<void>;
  onSetKey: (provider: ProviderId, apiKey: string) => Promise<void>;
  onRemoveKey: (provider: ProviderId) => Promise<void>;
  getMcpStatus: () => Promise<McpServerStatusInfo[]>;
}

/** Read-only list of configured MCP servers + their live connection state (polled while open). */
function McpConnectionsSection({
  getMcpStatus,
  labels,
}: {
  getMcpStatus: () => Promise<McpServerStatusInfo[]>;
  labels: {
    empty: string;
    tools: string;
    stateLabel: Record<McpServerState, string>;
  };
}) {
  const [servers, setServers] = useState<McpServerStatusInfo[]>([]);
  useEffect(() => {
    let alive = true;
    const load = (): void => {
      void getMcpStatus().then(
        (s) => {
          if (alive) setServers(s);
        },
        () => {
          /* status unavailable — leave the list as-is */
        },
      );
    };
    load();
    const id = setInterval(load, 3000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [getMcpStatus]);

  if (servers.length === 0) {
    return <p className="text-sm text-text-secondary">{labels.empty}</p>;
  }
  return (
    <div className="space-y-3">
      {servers.map((srv) => (
        <div key={srv.id} className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <span className="text-sm font-medium text-text-primary">{srv.label}</span>
            <span className="ml-2 text-xs text-text-secondary">
              {srv.transport}
              {srv.state === 'ready' ? ` · ${String(srv.toolCount)} ${labels.tools}` : ''}
            </span>
          </div>
          <Badge
            variant={
              srv.state === 'ready' ? 'success' : srv.state === 'error' ? 'error' : 'neutral'
            }
            dot
          >
            {labels.stateLabel[srv.state]}
          </Badge>
        </div>
      ))}
    </div>
  );
}

export function SettingsPage({
  prefs,
  status,
  onUpdatePrefs,
  onSetKey,
  onRemoveKey,
  getMcpStatus,
}: SettingsPageProps) {
  const s = useT(settingsDict);
  const c = useT(coreDict);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState<{
    variant: 'success' | 'error';
    message: string;
  } | null>(null);
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
  const localeLabel: Record<LocalePref, string> = {
    system: s.langSystem,
    en: 'English',
    tr: 'Türkçe',
  };

  async function saveKey(provider: ProviderId): Promise<void> {
    const key = (drafts[provider] ?? '').trim();
    if (key.length === 0) return;
    try {
      await onSetKey(provider, key);
      setDrafts((d) => ({ ...d, [provider]: '' }));
      notify('success', s.keySaved);
    } catch {
      notify('error', c.errors.upstreamDown);
    }
  }

  async function removeKey(provider: ProviderId): Promise<void> {
    try {
      await onRemoveKey(provider);
      notify('success', s.keyRemoved);
    } catch {
      notify('error', c.errors.upstreamDown);
    }
  }

  function setPref(patch: Partial<Preferences>): void {
    void onUpdatePrefs(patch).catch(() => {
      notify('error', c.errors.upstreamDown);
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
                    <span className="text-sm font-medium text-text-primary">
                      {s.providerNames[p]}
                    </span>
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
                    showPasswordLabel={c.common.showPassword}
                    hidePasswordLabel={c.common.hidePassword}
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
                      {c.common.save}
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
      id: 'notifications',
      label: s.notificationsTitle,
      icon: <IconBell />,
      searchText: `${s.notificationsTitle} ${s.notifications} ${s.notificationsDesc}`,
      content: (
        <Card title={s.notificationsTitle}>
          <Toggle
            id="notifications-enabled"
            label={s.notifications}
            description={s.notificationsDesc}
            checked={prefs.notificationsEnabled}
            onChange={(v) => {
              setPref({ notificationsEnabled: v });
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
    {
      id: 'connections',
      label: s.connectionsTitle,
      icon: <IconPlug />,
      searchText: `${s.connectionsTitle} ${s.connectionsSubtitle} MCP`,
      content: (
        <Card title={s.connectionsTitle} subtitle={s.connectionsSubtitle}>
          <McpConnectionsSection
            getMcpStatus={getMcpStatus}
            labels={{
              empty: s.mcpNoServers,
              tools: s.mcpToolCount,
              stateLabel: {
                idle: s.mcpStateIdle,
                connecting: s.mcpStateConnecting,
                ready: s.mcpStateReady,
                error: s.mcpStateError,
              },
            }}
          />
        </Card>
      ),
    },
  ];

  return (
    <SettingsLayout
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
