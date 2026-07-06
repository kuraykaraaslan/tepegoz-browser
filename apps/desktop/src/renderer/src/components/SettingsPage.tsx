import { useEffect, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faBell,
  faCircleInfo,
  faCreditCard,
  faDesktop,
  faDownload,
  faFolderTree,
  faGauge,
  faGear,
  faGlobe,
  faKey,
  faLock,
  faMagnifyingGlass,
  faPalette,
  faPlug,
  faRotateLeft,
  faShield,
  faSliders,
  faUniversalAccess,
} from '@fortawesome/free-solid-svg-icons';
import {
  ComingSoonCard,
  SettingsLayout,
  settingsDict,
  type SettingsSection,
} from '@tepegoz/settings-ui';
import { AlertBanner, Button, Card, Toggle } from '@tepegoz/ui';
import { coreDict } from '@tepegoz/i18n';
import { useT } from '@tepegoz/i18n/react';
import { SEARCH_ENGINES } from '@tepegoz/shared-types/search-engines';
import type {
  CredentialsStatus,
  LoginCredentialMeta,
  LoginImportResult,
  McpServerStatusInfo,
  Preferences,
  ProviderId,
} from '@tepegoz/desktop-ipc';
import { PROVIDERS } from './settings-shared';
import { AppearanceSection, LanguageRegionSection } from './settings-appearance-language';
import { LocalActionsSection, LocalModelsSection, McpConnectionsSection, ProvidersSection } from './settings-ai-panels';
import {
  AboutSection,
  FileOperationsSection,
  PasswordsSection,
  SearchStartupSection,
  SitePermissionsSection,
} from './settings-privacy-files';

const ICON = 'h-4 w-4';
const IconKey = () => <FontAwesomeIcon icon={faKey} className={ICON} aria-hidden />;
const IconPalette = () => <FontAwesomeIcon icon={faPalette} className={ICON} aria-hidden />;
const IconGlobe = () => <FontAwesomeIcon icon={faGlobe} className={ICON} aria-hidden />;
const IconShield = () => <FontAwesomeIcon icon={faShield} className={ICON} aria-hidden />;
const IconGauge = () => <FontAwesomeIcon icon={faGauge} className={ICON} aria-hidden />;
const IconBell = () => <FontAwesomeIcon icon={faBell} className={ICON} aria-hidden />;
const IconPlug = () => <FontAwesomeIcon icon={faPlug} className={ICON} aria-hidden />;
const IconLock = () => <FontAwesomeIcon icon={faLock} className={ICON} aria-hidden />;
const IconSearch = () => <FontAwesomeIcon icon={faMagnifyingGlass} className={ICON} aria-hidden />;
const IconFiles = () => <FontAwesomeIcon icon={faFolderTree} className={ICON} aria-hidden />;
const IconDownload = () => <FontAwesomeIcon icon={faDownload} className={ICON} aria-hidden />;
const IconA11y = () => <FontAwesomeIcon icon={faUniversalAccess} className={ICON} aria-hidden />;
const IconSliders = () => <FontAwesomeIcon icon={faSliders} className={ICON} aria-hidden />;
const IconCard = () => <FontAwesomeIcon icon={faCreditCard} className={ICON} aria-hidden />;
const IconDesktop = () => <FontAwesomeIcon icon={faDesktop} className={ICON} aria-hidden />;
const IconReset = () => <FontAwesomeIcon icon={faRotateLeft} className={ICON} aria-hidden />;
const IconInfo = () => <FontAwesomeIcon icon={faCircleInfo} className={ICON} aria-hidden />;
const IconGear = () => <FontAwesomeIcon icon={faGear} className="h-5 w-5" aria-hidden />;

interface SettingsPageProps {
  prefs: Preferences;
  status: CredentialsStatus;
  onUpdatePrefs: (patch: Partial<Preferences>) => Promise<void>;
  /** Reset every preference to its default (leaves stored credentials untouched). */
  onResetPrefs: () => Promise<void>;
  onAddKey: (provider: ProviderId, label: string, apiKey: string) => Promise<void>;
  onRemoveKeyById: (id: string) => Promise<void>;
  onRenameKey: (id: string, label: string) => Promise<void>;
  onReorderKeys: (orderedIds: string[]) => Promise<void>;
  getMcpStatus: () => Promise<McpServerStatusInfo[]>;
  loginCredentials: LoginCredentialMeta[];
  onLoginSectionMount: () => Promise<void>;
  onAddLogin: (c: { url: string; username: string; password: string; title?: string; notes?: string }) => Promise<void>;
  onRemoveLogin: (id: string) => Promise<void>;
  onImportLogins: (data: string, format: string) => Promise<LoginImportResult>;
  onExportLogins: (format: string) => Promise<string>;
}

export function SettingsPage({
  prefs,
  status,
  onUpdatePrefs,
  onResetPrefs,
  onAddKey,
  onRemoveKeyById,
  onRenameKey,
  onReorderKeys,
  getMcpStatus,
  loginCredentials,
  onLoginSectionMount,
  onAddLogin,
  onRemoveLogin,
  onImportLogins,
  onExportLogins,
}: SettingsPageProps) {
  const s = useT(settingsDict);
  const c = useT(coreDict);
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

  function setPref(patch: Partial<Preferences>): void {
    void onUpdatePrefs(patch).catch(() => {
      notify('error', c.errors.upstreamDown);
    });
  }

  function resetSitePermission(origin: string): void {
    const next = { ...prefs.sitePermissions };
    delete next[origin];
    setPref({ sitePermissions: next });
  }

  function clearBrowsingHistory(): void {
    void window.tepegoz.clearHistory().then(
      () => {
        notify('success', s.historyCleared);
      },
      () => {
        notify('error', c.errors.upstreamDown);
      },
    );
  }

  function resetToDefaults(): void {
    if (!window.confirm(s.resetConfirm)) return;
    void onResetPrefs().then(
      () => {
        notify('success', s.resetDone);
      },
      () => {
        notify('error', c.errors.upstreamDown);
      },
    );
  }

  const G_GENERAL = s.groupGeneral;
  const G_AI = s.groupAiAgent;
  const G_PRIVACY = s.groupPrivacy;
  const G_ADVANCED = s.groupAdvanced;
  const G_ABOUT = s.groupAbout;

  const sections: SettingsSection[] = [
    // ---------- General ----------
    {
      id: 'appearance',
      group: G_GENERAL,
      label: s.appearanceTitle,
      icon: <IconPalette />,
      searchText: `${s.appearanceTitle} ${s.theme} ${s.themeSystem} ${s.themeLight} ${s.themeDark}`,
      content: <AppearanceSection prefs={prefs} setPref={setPref} />,
    },
    {
      id: 'language',
      group: G_GENERAL,
      label: s.languageRegionTitle,
      icon: <IconGlobe />,
      searchText: `${s.languageRegionTitle} ${s.languageLabel} ${s.regionLabel} ${s.dateFormatLabel}`,
      content: <LanguageRegionSection prefs={prefs} setPref={setPref} />,
    },
    {
      id: 'preferences',
      group: G_GENERAL,
      label: s.preferencesTitle,
      icon: <IconSearch />,
      searchText: `${s.preferencesTitle} ${s.searchEngineLabel} ${s.coming.onStartup.title} ${SEARCH_ENGINES.map((e) => e.name).join(' ')}`,
      content: (
        <div className="space-y-6">
          <ComingSoonCard
            title={s.coming.onStartup.title}
            description={s.coming.onStartup.description}
            items={s.coming.onStartup.items}
          />
          <SearchStartupSection prefs={prefs} setPref={setPref} />
        </div>
      ),
    },
    {
      id: 'downloads',
      group: G_GENERAL,
      label: s.coming.downloads.title,
      icon: <IconDownload />,
      searchText: `${s.coming.downloads.title} ${s.coming.downloads.description}`,
      content: (
        <ComingSoonCard
          title={s.coming.downloads.title}
          description={s.coming.downloads.description}
          items={s.coming.downloads.items}
        />
      ),
    },
    {
      id: 'accessibility',
      group: G_GENERAL,
      label: s.coming.accessibility.title,
      icon: <IconA11y />,
      searchText: `${s.coming.accessibility.title} ${s.coming.accessibility.description}`,
      content: (
        <ComingSoonCard
          title={s.coming.accessibility.title}
          description={s.coming.accessibility.description}
        />
      ),
    },
    {
      id: 'notifications',
      group: G_GENERAL,
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
    // ---------- AI & Agent ----------
    {
      id: 'providers',
      group: G_AI,
      label: s.providersTitle,
      icon: <IconKey />,
      searchText: `${s.providersTitle} ${s.providersSubtitle} ${s.apiKey} ${s.addKey} ${PROVIDERS.map((p) => s.providerNames[p]).join(' ')}`,
      content: (
        <ProvidersSection
          keys={status.keys}
          encryptionAvailable={status.encryptionAvailable}
          onAdd={onAddKey}
          onRemoveById={onRemoveKeyById}
          onRename={onRenameKey}
          onReorder={onReorderKeys}
          notify={notify}
        />
      ),
    },
    {
      id: 'cost',
      group: G_AI,
      label: s.costTitle,
      icon: <IconGauge />,
      searchText: `${s.costTitle} ${s.localModel} ${s.localModelDesc} ${s.localActionsHint} ${s.localModels.title}`,
      content: (
        <div className="space-y-6">
          <LocalModelsSection />
          <LocalActionsSection prefs={prefs} setPref={setPref} />
        </div>
      ),
    },
    {
      id: 'connections',
      group: G_AI,
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
    {
      id: 'agent-controls',
      group: G_AI,
      label: s.coming.agentControls.title,
      icon: <IconSliders />,
      searchText: `${s.coming.agentControls.title} ${s.coming.agentControls.description}`,
      content: (
        <ComingSoonCard
          title={s.coming.agentControls.title}
          description={s.coming.agentControls.description}
          items={s.coming.agentControls.items}
        />
      ),
    },
    // ---------- Privacy & security ----------
    {
      id: 'privacy',
      group: G_PRIVACY,
      label: s.privacyTitle,
      icon: <IconShield />,
      searchText: `${s.privacyTitle} ${s.telemetry} ${s.telemetryDesc} ${s.clearHistoryLabel}`,
      content: (
        <Card title={s.privacyTitle}>
          <div className="space-y-4">
            <Toggle
              id="telemetry"
              label={s.telemetry}
              description={s.telemetryDesc}
              checked={prefs.telemetryEnabled}
              onChange={(v) => {
                setPref({ telemetryEnabled: v });
              }}
            />
            <div>
              <p className="text-sm font-medium text-text-primary">{s.clearHistoryLabel}</p>
              <p className="mb-2 text-xs text-text-secondary">{s.clearHistoryDesc}</p>
              <Button size="sm" variant="outline" onClick={clearBrowsingHistory}>
                {s.clearHistoryButton}
              </Button>
            </div>
          </div>
        </Card>
      ),
    },
    {
      id: 'site-permissions',
      group: G_PRIVACY,
      label: s.sitePermissionsTitle,
      icon: <IconLock />,
      searchText: `${s.sitePermissionsTitle} ${s.sitePermissionsSubtitle} ${s.sitePermissionNotifications}`,
      content: (
        <SitePermissionsSection
          sitePermissions={prefs.sitePermissions}
          onReset={resetSitePermission}
        />
      ),
    },
    {
      id: 'passwords',
      group: G_PRIVACY,
      label: s.passwordsTitle,
      icon: <IconLock />,
      searchText: `${s.passwordsTitle} logins autofill credentials import export Google CSV`,
      content: (
        <PasswordsSection
          credentials={loginCredentials}
          onMount={onLoginSectionMount}
          onAdd={onAddLogin}
          onRemove={onRemoveLogin}
          onImport={onImportLogins}
          onExport={onExportLogins}
        />
      ),
    },
    {
      id: 'autofill',
      group: G_PRIVACY,
      label: s.coming.autofill.title,
      icon: <IconCard />,
      searchText: `${s.coming.autofill.title} ${s.coming.autofill.description}`,
      content: (
        <ComingSoonCard
          title={s.coming.autofill.title}
          description={s.coming.autofill.description}
          items={s.coming.autofill.items}
        />
      ),
    },
    // ---------- Advanced ----------
    {
      id: 'file-operations',
      group: G_ADVANCED,
      label: s.fileOps.title,
      icon: <IconFiles />,
      searchText: `${s.fileOps.title} ${s.fileOps.subtitle} ${s.fileOps.enable} ${s.fileOps.addFolder}`,
      content: <FileOperationsSection prefs={prefs} setPref={setPref} />,
    },
    {
      id: 'system',
      group: G_ADVANCED,
      label: s.coming.system.title,
      icon: <IconDesktop />,
      searchText: `${s.coming.system.title} ${s.coming.system.description}`,
      content: (
        <ComingSoonCard
          title={s.coming.system.title}
          description={s.coming.system.description}
          items={s.coming.system.items}
        />
      ),
    },
    {
      id: 'reset',
      group: G_ADVANCED,
      label: s.resetTitle,
      icon: <IconReset />,
      searchText: `${s.resetTitle} ${s.resetDesc}`,
      content: (
        <Card title={s.resetTitle}>
          <p className="mb-3 text-sm text-text-secondary">{s.resetDesc}</p>
          <Button size="sm" variant="outline" onClick={resetToDefaults}>
            {s.resetButton}
          </Button>
        </Card>
      ),
    },
    // ---------- About ----------
    {
      id: 'about',
      group: G_ABOUT,
      label: s.aboutTitle,
      icon: <IconInfo />,
      searchText: `${s.aboutTitle} ${s.aboutProjectTitle} ${s.aboutVersion} ${s.aboutPlatform}`,
      content: <AboutSection />,
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
