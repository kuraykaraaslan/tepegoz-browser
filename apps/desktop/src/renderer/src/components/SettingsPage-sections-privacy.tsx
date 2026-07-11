import { ComingSoonCard, type SettingsSection } from '@tepegoz/settings-ui';
import { Button, Card, Toggle } from '@tepegoz/ui';
import {
  AboutSection,
  FileOperationsSection,
  PasswordsSection,
  SitePermissionsSection,
} from './settings-privacy-files';
import { DeveloperSection } from './settings-developer';
import {
  IconCard,
  IconDesktop,
  IconDeveloper,
  IconFiles,
  IconInfo,
  IconLock,
  IconReset,
  IconShield,
} from './SettingsPage-icons';
import type { SettingsSectionsCtx } from './SettingsPage-sections';

/** The "Privacy & security", "Advanced", and "About" section groups. Pure builders — deps via `ctx`. */
export function privacyAndAdvancedSections(ctx: SettingsSectionsCtx): SettingsSection[] {
  const { s, prefs, setPref, developerVisible } = ctx;
  return [
    // ---------- Privacy & security ----------
    {
      id: 'privacy',
      group: s.groupPrivacy,
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
              <Button size="sm" variant="outline" onClick={ctx.clearBrowsingHistory}>
                {s.clearHistoryButton}
              </Button>
            </div>
          </div>
        </Card>
      ),
    },
    {
      id: 'site-permissions',
      group: s.groupPrivacy,
      label: s.sitePermissionsTitle,
      icon: <IconLock />,
      searchText: `${s.sitePermissionsTitle} ${s.sitePermissionsSubtitle} ${s.sitePermissionNotifications}`,
      content: (
        <SitePermissionsSection
          sitePermissions={prefs.sitePermissions}
          onReset={ctx.resetSitePermission}
        />
      ),
    },
    {
      id: 'passwords',
      group: s.groupPrivacy,
      label: s.passwordsTitle,
      icon: <IconLock />,
      searchText: `${s.passwordsTitle} logins autofill credentials import export Google CSV`,
      content: (
        <PasswordsSection
          credentials={ctx.loginCredentials}
          onMount={ctx.onLoginSectionMount}
          onAdd={ctx.onAddLogin}
          onRemove={ctx.onRemoveLogin}
          onImport={ctx.onImportLogins}
          onExport={ctx.onExportLogins}
        />
      ),
    },
    {
      id: 'autofill',
      group: s.groupPrivacy,
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
      group: s.groupAdvanced,
      label: s.fileOps.title,
      icon: <IconFiles />,
      searchText: `${s.fileOps.title} ${s.fileOps.subtitle} ${s.fileOps.enable} ${s.fileOps.addFolder}`,
      content: <FileOperationsSection prefs={prefs} setPref={setPref} />,
    },
    {
      id: 'system',
      group: s.groupAdvanced,
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
    ...(developerVisible
      ? [
          {
            id: 'developer',
            group: s.groupAdvanced,
            label: s.developerTitle,
            icon: <IconDeveloper />,
            searchText: `${s.developerTitle} ${s.developerDesc} ${s.developerSearchPlaceholder} settings preferences public private`,
            content: <DeveloperSection prefs={prefs} onUpdatePrefs={ctx.setDeveloperPref} />,
          },
        ]
      : []),
    {
      id: 'reset',
      group: s.groupAdvanced,
      label: s.resetTitle,
      icon: <IconReset />,
      searchText: `${s.resetTitle} ${s.resetDesc}`,
      content: (
        <Card title={s.resetTitle}>
          <p className="mb-3 text-sm text-text-secondary">{s.resetDesc}</p>
          <Button size="sm" variant="outline" onClick={ctx.resetToDefaults}>
            {s.resetButton}
          </Button>
        </Card>
      ),
    },
    // ---------- About ----------
    {
      id: 'about',
      group: s.groupAbout,
      label: s.aboutTitle,
      icon: <IconInfo />,
      searchText: `${s.aboutTitle} ${s.aboutProjectTitle} ${s.aboutVersion} ${s.aboutPlatform}`,
      content: <AboutSection />,
    },
  ];
}
