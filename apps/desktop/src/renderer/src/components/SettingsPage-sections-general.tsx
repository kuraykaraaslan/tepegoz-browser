import { ComingSoonCard, type SettingsSection } from '@tepegoz/settings-ui';
import { Card, Toggle } from '@tepegoz/ui';
import { SEARCH_ENGINES } from '@tepegoz/shared-types/search-engines';
import { PROVIDERS } from './settings-shared';
import { AppearanceSection, LanguageRegionSection } from './settings-appearance-language';
import {
  DefaultModelsSection,
  LocalActionsSection,
  LocalModelsSection,
  ProvidersSection,
  TokenBudgetSection,
} from './settings-ai-panels';
import { AdaptorsSection } from './settings-adaptors-section';
import { DownloadSettingsSection, SearchStartupSection } from './settings-privacy-files';
import {
  IconA11y,
  IconBell,
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
      group: s.groupGeneral,
      label: s.downloadsTitle,
      icon: <IconDownload />,
      searchText: `${s.downloadsTitle} ${s.downloadLocationLabel} ${s.downloadAskEachTime} ${s.clearDownloadsLabel}`,
      content: <DownloadSettingsSection prefs={prefs} setPref={setPref} />,
    },
    {
      id: 'accessibility',
      group: s.groupGeneral,
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
      group: s.groupGeneral,
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
      group: s.groupAiAgent,
      label: s.providersTitle,
      icon: <IconKey />,
      searchText: `${s.providersTitle} ${s.providersSubtitle} ${s.apiKey} ${s.addKey} ${s.defaultModels.title} ${s.defaultModels.subtitle} ${PROVIDERS.map((p) => s.providerNames[p]).join(' ')}`,
      content: (
        <div className="space-y-6">
          <ProvidersSection
            keys={status.keys}
            encryptionAvailable={status.encryptionAvailable}
            onAdd={ctx.onAddKey}
            onRemoveById={ctx.onRemoveKeyById}
            onRename={ctx.onRenameKey}
            onReorder={ctx.onReorderKeys}
            notify={notify}
          />
          <DefaultModelsSection prefs={prefs} setPref={setPref} />
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
      searchText: `${s.adaptorInventoryTitle} ${s.adaptorInventorySubtitle} MCP REST GraphQL OAuth`,
      content: <AdaptorsSection />,
    },
    {
      id: 'agent-controls',
      group: s.groupAiAgent,
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
  ];
}
