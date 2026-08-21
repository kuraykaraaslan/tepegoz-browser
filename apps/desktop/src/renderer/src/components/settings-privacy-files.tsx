import { useEffect, useState } from 'react';
import { settingsDict } from '@tepegoz/settings-ui';
import { Button, Card, Input, Toggle } from '@tepegoz/ui';
import { useT } from '@tepegoz/i18n/react';
import type {
  AppInfo,
  LoginCredentialMeta,
  LoginImportResult,
  Preferences,
} from '@tepegoz/desktop-ipc';
import { CredentialsSettings, ImportExportPanel } from '@tepegoz/password-ui';

/**
 * Privacy/security + advanced settings panels: per-site permissions, file operations, passwords,
 * search/startup, and about. Split out of `SettingsPage.tsx` (ADR-0010 250-line cap).
 *
 * The two largest panels live in siblings and are re-exported here so this module keeps its full
 * public surface: `SearchStartupSection` (search/startup) and `FileOperationsSection` (file ops).
 */
export { SearchStartupSection } from './settings-privacy-files-search';
export { FileOperationsSection } from './settings-privacy-files-file-ops';

export function DownloadSettingsSection({
  prefs,
  setPref,
}: {
  prefs: Preferences;
  setPref: (patch: Partial<Preferences>) => void;
}) {
  const s = useT(settingsDict);

  function clearDownloads(): void {
    void window.tepegoz.listDownloads().then((downloads) => {
      for (const item of downloads) {
        if (['completed', 'blocked', 'canceled', 'failed'].includes(item.status)) {
          void window.tepegoz.commandDownload({ id: item.id, action: 'clear' });
        }
      }
    });
  }

  return (
    <Card title={s.downloadsTitle} subtitle={s.downloadsSubtitle}>
      <div className="space-y-5">
        <Input
          id="download-directory"
          label={s.downloadLocationLabel}
          hint={s.downloadLocationDesc}
          placeholder={s.downloadLocationPlaceholder}
          value={prefs.downloadDirectory}
          onChange={(e) => {
            setPref({ downloadDirectory: e.target.value });
          }}
        />
        <Toggle
          id="download-ask-each-time"
          label={s.downloadAskEachTime}
          description={s.downloadAskEachTimeDesc}
          checked={prefs.downloadAskEachTime}
          onChange={(v) => {
            setPref({ downloadAskEachTime: v });
          }}
        />
        <div>
          <p className="text-sm font-medium text-text-primary">{s.clearDownloadsLabel}</p>
          <p className="mb-2 text-xs text-text-secondary">{s.clearDownloadsDesc}</p>
          <Button size="sm" variant="outline" onClick={clearDownloads}>
            {s.clearDownloadsButton}
          </Button>
        </div>
      </div>
    </Card>
  );
}

/** Per-origin web-capability permissions (currently notifications consent), with a per-origin reset. */
export function SitePermissionsSection({
  sitePermissions,
  onReset,
}: {
  sitePermissions: Preferences['sitePermissions'];
  onReset: (origin: string) => void;
}) {
  const s = useT(settingsDict);
  const entries = Object.entries(sitePermissions);
  return (
    <Card title={s.sitePermissionsTitle} subtitle={s.sitePermissionsSubtitle}>
      {entries.length === 0 ? (
        <p className="text-sm text-text-secondary">{s.sitePermissionsEmpty}</p>
      ) : (
        <ul className="space-y-1.5">
          {entries.map(([origin, perms]) => (
            <li
              key={origin}
              className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2"
            >
              <div className="min-w-0">
                <span className="truncate font-mono text-xs text-text-primary">{origin}</span>
                {perms.notifications !== undefined && (
                  <span className="ml-2 text-xs text-text-secondary">
                    {s.sitePermissionNotifications}: {perms.notifications}
                  </span>
                )}
                {perms.clipboardRead !== undefined && (
                  <span className="ml-2 text-xs text-text-secondary">
                    {s.sitePermissionClipboardRead}: {perms.clipboardRead}
                  </span>
                )}
                {perms.clipboardWrite !== undefined && (
                  <span className="ml-2 text-xs text-text-secondary">
                    {s.sitePermissionClipboardWrite}: {perms.clipboardWrite}
                  </span>
                )}
              </div>
              <Button size="sm" variant="outline" onClick={() => onReset(origin)}>
                {s.permissionReset}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/** About: project blurb + app info + the author's links (open in a new tab). */
export function AboutSection() {
  const s = useT(settingsDict);
  const [info, setInfo] = useState<AppInfo | null>(null);
  useEffect(() => {
    void window.tepegoz.getAppInfo().then(setInfo, () => {
      /* leave null */
    });
  }, []);
  const open = (url: string): void => {
    window.tepegoz.createTab(url);
  };
  return (
    <div className="space-y-6">
      <Card title={s.aboutProjectTitle}>
        <p className="text-sm text-text-secondary">{s.aboutProjectDesc}</p>
        {info !== null && (
          <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            <dt className="text-text-secondary">{s.aboutName}</dt>
            <dd className="text-text-primary">{info.name}</dd>
            <dt className="text-text-secondary">{s.aboutVersion}</dt>
            <dd className="font-mono text-text-primary">{info.version}</dd>
            <dt className="text-text-secondary">{s.aboutPlatform}</dt>
            <dd className="font-mono text-text-primary">{info.platform}</dd>
          </dl>
        )}
      </Card>
      <Card title={s.aboutAuthorTitle}>
        <p className="mb-3 text-sm font-medium text-text-primary">{s.authorName}</p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => open('https://kuray.dev')}>
            {s.aboutWebsite}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => open('https://github.com/kuraykaraaslan')}
          >
            {s.aboutGithub}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => open('https://www.linkedin.com/in/kuraykaraaslan')}
          >
            {s.aboutLinkedin}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => open('https://www.instagram.com/kuraykaraaslan')}
          >
            {s.aboutInstagram}
          </Button>
        </div>
      </Card>
    </div>
  );
}

export function PasswordsSection({
  credentials,
  onMount,
  onAdd,
  onRemove,
  onImport,
  onExport,
}: {
  credentials: LoginCredentialMeta[];
  onMount: () => Promise<void>;
  onAdd: (c: {
    url: string;
    username: string;
    password: string;
    title?: string;
    notes?: string;
  }) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
  onImport: (data: string, format: string) => Promise<LoginImportResult>;
  onExport: (format: string) => Promise<string>;
}) {
  const s = useT(settingsDict);
  useEffect(() => {
    void onMount();
  }, []);

  return (
    <Card title={s.passwordsTitle}>
      <div className="space-y-4">
        <CredentialsSettings credentials={credentials} onAdd={onAdd} onRemove={onRemove} />
        <ImportExportPanel onImport={onImport} onExport={onExport} />
      </div>
    </Card>
  );
}
