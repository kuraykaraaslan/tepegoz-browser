import { useEffect, useState } from 'react';
import { ComingSoonCard, type SettingsSection, type SettingsStrings } from '@tepegoz/settings-ui';
import type { SiteClearPlan } from '@tepegoz/shared-types';
import type { ClientCertificateChoice } from '@tepegoz/desktop-ipc';
import { Button, Card, Toggle } from '@tepegoz/ui';
import { ConfirmAction } from './settings-confirm';
import { ClearBrowsingDataRow } from './ClearBrowsingDataRow';
import { FileOperationsSection, PasswordsSection } from './settings-privacy-files';
import { AboutSection } from './settings-about';
import { DeveloperSection } from './settings-developer';
import { SystemSection } from './settings-system';
import { SiteTrustSection } from './settings-site-trust';
import { ShortcutsSection } from './settings-shortcuts';
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
import { AgentPermissionMatrix, PermissionsCenter } from './PermissionsCenter';

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
        <div className="mt-2 rounded-md border border-warning bg-warning-subtle px-3 py-2">
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
/**
 * "Sites you identified yourself to" — the review surface for the client-certificate broker's
 * per-origin memory.
 *
 * The broker remembers a decision for the rest of the run so that a site needing client auth stays
 * usable (TLS renegotiates per connection; asking every time would make those sites unusable). But a
 * remembered "yes" is a standing instruction to identify yourself, and an instruction the user cannot
 * see is one they cannot withdraw. This is where they see it.
 *
 * A remembered "no" is listed too. It is as much a decision as a yes, and someone who refused by
 * reflex and now needs the site has no other way back.
 *
 * Origins only, never subjects: the certificate never leaves the main process, and neither does the
 * name it carries.
 */
function ClientCertificatesRow({ s }: { s: SettingsStrings }) {
  const [choices, setChoices] = useState<ClientCertificateChoice[] | null>(null);
  const [forgotten, setForgotten] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    void window.tepegoz.listClientCertificateChoices().then(
      (list) => {
        if (live) setChoices(list);
      },
      () => {
        // An empty list here reads as "you have identified yourself to nobody", which is the most
        // reassuring possible way to fail at showing standing grants. Say it could not be read.
        if (live) {
          setChoices([]);
          setFailed(true);
        }
      },
    );
    return () => {
      live = false;
    };
  }, [forgotten]);

  const forget = (): void => {
    void window.tepegoz.forgetClientCertificateChoices().then(
      () => {
        setForgotten(true);
        setChoices([]);
      },
      () => undefined,
    );
  };

  return (
    <div>
      <p className="text-sm font-medium text-text-primary">{s.clientCerts.title}</p>
      <p className="mb-2 text-xs text-text-secondary">{s.clientCerts.desc}</p>
      {failed ? (
        <p className="text-xs text-error">{s.clientCerts.unavailable}</p>
      ) : choices !== null && choices.length === 0 ? (
        <p className="text-xs text-text-secondary">
          {forgotten ? s.clientCerts.forgotten : s.clientCerts.empty}
        </p>
      ) : (
        <>
          <ul className="mb-2 space-y-1">
            {(choices ?? []).map((c) => (
              <li key={c.origin} className="text-xs text-text-secondary">
                <span className="text-text-primary">{c.origin}</span>
                {' — '}
                {c.sent ? s.clientCerts.sent : s.clientCerts.refused}
              </li>
            ))}
          </ul>
          <Button size="sm" variant="outline" onClick={forget}>
            {s.clientCerts.forget}
          </Button>
          <p className="mt-1 text-xs text-text-secondary">{s.clientCerts.forgetNote}</p>
        </>
      )}
      <p className="mt-1 text-xs text-text-secondary">{s.clientCerts.sessionNote}</p>
    </div>
  );
}

export function privacyAndAdvancedSections(ctx: SettingsSectionsCtx): SettingsSection[] {
  const { s, prefs, setPref, developerVisible } = ctx;
  return [
    // ---------- Privacy & security ----------
    {
      id: 'privacy',
      group: s.groupPrivacy,
      label: s.privacyTitle,
      icon: <IconShield />,
      searchText: `${s.privacyTitle} ${s.telemetry} ${s.telemetryDesc} ${s.telemetryNothingSent} ${s.safeBrowsing.title} ${s.safeBrowsing.desc} ${s.clearData.title} ${s.clearData.desc} ${s.clearHistoryLabel} ${s.forgetSite.title} ${s.clientCerts.title}`,
      content: (
        <Card title={s.privacyTitle}>
          <div className="space-y-4">
            <div>
              <Toggle
                id="telemetry"
                label={s.telemetry}
                description={s.telemetryDesc}
                checked={prefs.telemetryEnabled}
                onChange={(v) => {
                  setPref({ telemetryEnabled: v });
                }}
              />
              {/* Said plainly, because the switch alone implies a pipeline that does not exist: no
                  code in this build reads `telemetryEnabled` to collect or send anything. A privacy
                  control whose scope the user has to infer is one they cannot actually rely on. */}
              <p className="mt-1.5 text-xs text-text-secondary">{s.telemetryNothingSent}</p>
            </div>
            <div>
              <Toggle
                id="safe-browsing"
                label={s.safeBrowsing.title}
                description={s.safeBrowsing.desc}
                checked={prefs.safeBrowsingEnabled}
                onChange={(v) => {
                  setPref({ safeBrowsingEnabled: v });
                }}
              />
              {/* The threat list + API key are not wired yet (ADR-0043); the switch persists and the
                  provider reads it, but resolves `unknown` until then. Said plainly. */}
              <p className="mt-1.5 text-xs text-text-secondary">{s.safeBrowsing.inactiveNote}</p>
            </div>
            <ClearBrowsingDataRow s={s} />
            <div>
              <p className="text-sm font-medium text-text-primary">{s.clearHistoryLabel}</p>
              <p className="mb-2 text-xs text-text-secondary">{s.clearHistoryDesc}</p>
              <ConfirmAction
                label={s.clearHistoryButton}
                title={s.clearHistoryLabel}
                body={s.clearHistoryConfirm}
                confirmLabel={s.clearHistoryButton}
                onConfirm={ctx.clearBrowsingHistory}
              />
            </div>
            <ForgetSiteRow s={s} />
            <ClientCertificatesRow s={s} />
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
      label: s.permissionsCenter.sitesTitle,
      icon: <IconLock />,
      searchText: `${s.permissionsCenter.sitesTitle} ${s.permissionsCenter.sitesSubtitle} ${s.permissionsCenter.agentTitle} ${s.permissionsCenter.capability.camera} ${s.permissionsCenter.capability.microphone} ${s.permissionsCenter.capability.geolocation}`,
      content: (
        <div className="space-y-4">
          <PermissionsCenter
            sitePermissions={prefs.sitePermissions}
            s={s}
            onSet={ctx.setSitePermission}
            onReset={ctx.resetSitePermission}
          />
          <AgentPermissionMatrix s={s} />
        </div>
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
      id: 'shortcuts',
      group: s.groupPrivacy,
      label: s.shortcuts.title,
      icon: <IconDesktop />,
      searchText: `${s.shortcuts.title} ${s.shortcuts.subtitle} ${s.shortcuts.descriptions.commandPalette} ${s.shortcuts.descriptions.find} ${s.shortcuts.notRebindable}`,
      content: <ShortcutsSection />,
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
      label: s.system.title,
      icon: <IconDesktop />,
      searchText: `${s.system.title} ${s.system.hardwareAcceleration} ${s.system.hardwareAccelerationDesc} ${s.system.elsewhereTitle} GPU`,
      content: <SystemSection prefs={prefs} setPref={setPref} />,
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
      searchText: `${s.aboutTitle} ${s.aboutProjectTitle} ${s.aboutVersion} ${s.aboutPlatform} ${s.aboutBuildTitle} ${s.aboutChromium} ${s.aboutElectron} ${s.aboutNode} ${s.aboutLegalTitle} ${s.aboutLicense} ${s.aboutThirdPartyTitle} ${s.aboutUpdatesTitle} ${s.aboutSource} ${s.aboutReportIssue} ${s.aboutCopyDiagnostics}`,
      content: <AboutSection />,
    },
  ];
}
