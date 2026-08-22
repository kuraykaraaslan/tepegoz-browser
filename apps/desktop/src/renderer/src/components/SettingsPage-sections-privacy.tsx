import { useState } from 'react';
import { ComingSoonCard, type SettingsSection, type SettingsStrings } from '@tepegoz/settings-ui';
import type { SiteClearPlan } from '@tepegoz/shared-types';
import { Button, Card, Toggle } from '@tepegoz/ui';
import {
  AboutSection,
  FileOperationsSection,
  PasswordsSection,
  SitePermissionsSection,
} from './settings-privacy-files';
import { DeveloperSection } from './settings-developer';
import { SiteTrustSection } from './settings-site-trust';
import { NetworkPrivacySection } from './settings-network-privacy';
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

/**
 * "Forget this site" (Phase 2). Two-step by construction: the first click PLANS, which is what
 * produces the warnings, and only the second clears. A single-click version would be smaller and
 * would sign people out of sites they were using without ever telling them.
 */
function ForgetSiteRow({ s }: { s: SettingsStrings }) {
  const [url, setUrl] = useState('');
  const [plan, setPlan] = useState<SiteClearPlan | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const preview = (): void => {
    setDone(null);
    void window.tepegoz.planSiteDataClear(url).then(setPlan, () => {
      setPlan(null);
    });
  };
  const confirm = (): void => {
    void window.tepegoz.clearSiteData(url).then(
      (cleared) => {
        setPlan(null);
        setDone(cleared?.site ?? null);
      },
      () => {
        setPlan(null);
      },
    );
  };

  return (
    <div>
      <p className="text-sm font-medium text-text-primary">{s.forgetSite.title}</p>
      <p className="mb-2 text-xs text-text-secondary">{s.forgetSite.desc}</p>
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={url}
          placeholder={s.forgetSite.placeholder}
          aria-label={s.forgetSite.title}
          onChange={(e) => {
            setUrl(e.target.value);
            setPlan(null);
            setDone(null);
          }}
          className="min-w-0 flex-1 rounded-md border border-border bg-surface-base px-2 py-1 text-sm text-text-primary placeholder:text-text-disabled focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
        />
        <Button size="sm" variant="outline" disabled={url.trim().length === 0} onClick={preview}>
          {s.forgetSite.review}
        </Button>
      </div>
      {plan !== null && (
        <div className="mt-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2">
          <p className="text-sm text-text-primary">
            {s.forgetSite.confirmFor.replace('{site}', plan.site)}
          </p>
          <ul className="mt-1 list-disc pl-5 text-xs text-text-secondary">
            {plan.warnings.map((w) => (
              <li key={w}>{s.forgetSite.warning[w]}</li>
            ))}
            <li>{s.forgetSite.vaultUntouched}</li>
          </ul>
          <Button size="sm" variant="outline" className="mt-2" onClick={confirm}>
            {s.forgetSite.confirm}
          </Button>
        </div>
      )}
      {done !== null && (
        <p className="mt-2 text-xs text-text-secondary">
          {s.forgetSite.cleared.replace('{site}', done)}
        </p>
      )}
    </div>
  );
}

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
      searchText: `${s.privacyTitle} ${s.telemetry} ${s.telemetryDesc} ${s.clearHistoryLabel} ${s.forgetSite.title}`,
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
            <ForgetSiteRow s={s} />
          </div>
        </Card>
      ),
    },
    {
      // Network privacy sits directly under "Privacy & security": it is a core browser routing setting,
      // not an extension feature, and the tab/group context menus deep-link here to manage connections.
      id: 'network-privacy',
      group: s.groupPrivacy,
      label: s.network.title,
      icon: <IconShield />,
      searchText: `${s.network.title} ${s.network.intro} ${s.network.defaultRoute} ${s.network.connections} SOCKS Tor VPN`,
      content: <NetworkPrivacySection s={s} />,
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
      id: 'site-trust',
      group: s.groupPrivacy,
      label: s.siteTrust.title,
      icon: <IconLock />,
      searchText: `${s.siteTrust.title} ${s.siteTrust.subtitle} ${s.siteTrust.levels.trusted} ${s.siteTrust.levels.restricted}`,
      content: <SiteTrustSection />,
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
