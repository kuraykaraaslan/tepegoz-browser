import type { SettingsSection } from '@tepegoz/settings-ui';
import { Card, Toggle } from '@tepegoz/ui';
import { SEARCH_ENGINES } from '@tepegoz/shared-types/search-engines';
import { PROVIDERS } from './settings-shared';
import { CrossLink } from './settings-shared';
import { AccessibilitySection } from './settings-accessibility';
import { AgentControlsSection } from './settings-agent-controls';
import { StartupSection } from './settings-startup';
import { TraySection } from './settings-tray';
import { AppearanceSection, LanguageRegionSection } from './settings-appearance-language';
import {
  LocalActionsSection,
  LocalModelsSection,
  ProvidersSection,
  TokenBudgetSection,
} from './settings-ai-panels';
import { AdaptorsSection } from './settings-adaptors-section';
import { McpServersSection } from './settings-mcp-servers';
import { DefaultBrowserSection } from './settings-default-browser';
import { SearchStartupSection } from './settings-privacy-files';
import { DownloadSettingsSection } from './settings-downloads';
import {
  IconA11y,
  IconBell,
  IconDesktop,
  IconDownload,
  IconGauge,
  IconGlobe,
  IconKey,
  IconPalette,
  IconPlug,
  IconSearch,
  IconSliders,
} from './SettingsPage-icons';
import type { SettingsSectionsCtx } from './SettingsPage-sections';

/** The "General" and "AI & Agent" section groups. Pure builders — state/handlers come via `ctx`. */
export function generalAndAiSections(ctx: SettingsSectionsCtx): SettingsSection[] {
  const { s, prefs, status, setPref, notify } = ctx;
  return [
    // ---------- General ----------
    {
      id: 'appearance',
      group: s.groupGeneral,
      label: s.appearanceTitle,
      icon: <IconPalette />,
      searchText: `${s.appearanceTitle} ${s.theme} ${s.themeSystem} ${s.themeLight} ${s.themeDark} ${s.glassTitle} ${s.glassHint}`,
      content: <AppearanceSection prefs={prefs} setPref={setPref} />,
    },
    {
      id: 'language',
      group: s.groupGeneral,
      label: s.languageRegionTitle,
      icon: <IconGlobe />,
      searchText: `${s.languageRegionTitle} ${s.languageLabel} ${s.regionLabel} ${s.dateFormatLabel}`,
      content: <LanguageRegionSection prefs={prefs} setPref={setPref} />,
    },
    {
      id: 'preferences',
      group: s.groupGeneral,
      label: s.preferencesTitle,
      icon: <IconSearch />,
      searchText: `${s.preferencesTitle} ${s.searchEngineLabel} ${s.startup.title} ${s.tray.startupMode} ${s.tray.launchAtLogin} ${s.tray.kioskUrl} ${SEARCH_ENGINES.map((e) => e.name).join(' ')}`,
      content: (
        <div className="space-y-6">
          <StartupSection prefs={prefs} setPref={setPref} />
          <SearchStartupSection prefs={prefs} setPref={setPref} />
        </div>
      ),
    },
    {
      id: 'default-browser',
      group: s.groupGeneral,
      label: s.defaultBrowser.title,
      icon: <IconDesktop />,
      searchText: `${s.defaultBrowser.title} ${s.defaultBrowser.isDefault} ${s.defaultBrowser.notDefault} ${s.defaultBrowser.makeDefault}`,
      content: <DefaultBrowserSection />,
    },
    {
      id: 'downloads',
      group: s.groupGeneral,
      label: s.downloadsTitle,
      icon: <IconDownload />,
      searchText: `${s.downloadsTitle} ${s.downloadLocationLabel} ${s.downloadAskEachTime} ${s.clearDownloadsLabel}`,
      content: <DownloadSettingsSection prefs={prefs} setPref={setPref} />,
    },
    {
      id: 'accessibility',
      group: s.groupGeneral,
      label: s.accessibility.title,
      icon: <IconA11y />,
      searchText: `${s.accessibility.title} ${s.accessibility.subtitle} ${s.accessibility.pageZoom} ${s.accessibility.reduceMotion} zoom motion`,
      content: <AccessibilitySection prefs={prefs} setPref={setPref} />,
    },
    {
      id: 'notifications',
      group: s.groupGeneral,
      label: s.notificationsTitle,
      icon: <IconBell />,
      searchText: `${s.notificationsTitle} ${s.notifications} ${s.notificationsDesc} ${s.notificationsSiteNote}`,
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
          {/* The master switch and the per-site grants are two different things, and which one wins
              is not guessable from either screen. Said here, where the switch is. */}
          <p className="mt-4 text-xs text-text-secondary">
            {s.notificationsSiteNote}{' '}
            <CrossLink sectionId="site-permissions">{s.notificationsSiteLink}</CrossLink>
          </p>
        </Card>
      ),
    },
    {
      id: 'system-tray',
      group: s.groupGeneral,
      label: s.tray.title,
      icon: <IconSliders />,
      searchText: `${s.tray.title} ${s.tray.closeToTray} ${s.tray.keepAwake} ${s.tray.pauseOnSleep} ${s.tray.tabDiscard} ${s.tray.tabDiscardIdleMinutes}`,
      content: <TraySection prefs={prefs} setPref={setPref} />,
    },
    // ---------- AI & Agent ----------
    {
      id: 'providers',
      group: s.groupAiAgent,
      label: s.providersTitle,
      icon: <IconKey />,
      searchText: `${s.providersTitle} ${s.providersSubtitle} ${s.apiKey} ${s.addKey} ${s.keyModel.label} ${s.keyModel.hint} ${PROVIDERS.map((p) => s.providerNames[p]).join(' ')}`,
      content: (
        <div className="space-y-6">
          <ProvidersSection
            keys={status.keys}
            encryptionAvailable={status.encryptionAvailable}
            onAdd={ctx.onAddKey}
            onRemoveById={ctx.onRemoveKeyById}
            onRename={ctx.onRenameKey}
            onSetModel={ctx.onSetKeyModel}
            onReorder={ctx.onReorderKeys}
            notify={notify}
          />
        </div>
      ),
    },
    {
      id: 'cost',
      group: s.groupAiAgent,
      label: s.costTitle,
      icon: <IconGauge />,
      searchText: `${s.costTitle} ${s.localModel} ${s.localModelDesc} ${s.localActionsHint} ${s.localModels.title} ${s.tokenBudget.title} ${s.tokenBudget.desc}`,
      content: (
        <div className="space-y-6">
          <TokenBudgetSection prefs={prefs} setPref={setPref} />
          <LocalModelsSection />
          <LocalActionsSection prefs={prefs} setPref={setPref} />
        </div>
      ),
    },
    {
      id: 'connections',
      group: s.groupAiAgent,
      label: s.adaptorInventoryTitle,
      icon: <IconPlug />,
      searchText: `${s.adaptorInventoryTitle} ${s.adaptorInventorySubtitle} ${s.mcp.title} ${s.mcp.subtitle} MCP REST GraphQL OAuth stdio`,
      content: (
        <div className="space-y-6">
          <McpServersSection prefs={prefs} setPref={setPref} />
          <AdaptorsSection />
        </div>
      ),
    },
    {
      id: 'agent-controls',
      group: s.groupAiAgent,
      label: s.agentControls.title,
      icon: <IconSliders />,
      searchText: `${s.agentControls.title} ${s.agentControls.autonomyHint} ${s.agentControls.effortHint} ${s.agentControls.elsewhereTitle} autonomy effort guard`,
      content: <AgentControlsSection prefs={prefs} setPref={setPref} />,
    },
  ];
}
