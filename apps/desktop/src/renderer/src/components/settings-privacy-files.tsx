import { useEffect, useState } from 'react';
import { settingsDict } from '@tepegoz/settings-ui';
import { Button, Card, cn, Input, Toggle } from '@tepegoz/ui';
import { useT } from '@tepegoz/i18n/react';
import { DEFAULT_SEARCH_ENGINE_ID, SEARCH_ENGINES } from '@tepegoz/shared-types/search-engines';
import { FILE_ACCESS_MODES } from '@tepegoz/desktop-ipc';
import type {
  AppInfo,
  FileAccessGrant,
  FileAccessMode,
  LoginCredentialMeta,
  LoginImportResult,
  Preferences,
} from '@tepegoz/desktop-ipc';
import { CredentialsSettings, ImportExportPanel } from '@tepegoz/password-ui';
import { Select } from './settings-shared';

/**
 * Privacy/security + advanced settings panels: per-site permissions, file operations, passwords,
 * search/startup, and about. Split out of `SettingsPage.tsx` (ADR-0010 250-line cap).
 */

/**
 * Homepage URL + default/custom search engines. The homepage drives new tabs, the Home button, and a
 * blank omnibox submit; the search engine (built-in or user-added) resolves typed omnibox queries.
 * Custom engines are persisted in `prefs.customSearchEngines` and merged with the built-in list.
 */
export function SearchStartupSection({
  prefs,
  setPref,
}: {
  prefs: Preferences;
  setPref: (patch: Partial<Preferences>) => void;
}) {
  const s = useT(settingsDict);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const engines = [...SEARCH_ENGINES, ...prefs.customSearchEngines];
  const urlInvalid = url.length > 0 && !url.includes('{q}');
  const canAdd = name.trim().length > 0 && url.trim().length > 0 && !urlInvalid;

  function addEngine(): void {
    if (!canAdd) return;
    const engine = { id: `custom-${crypto.randomUUID()}`, name: name.trim(), searchUrlTemplate: url.trim() };
    setPref({ customSearchEngines: [...prefs.customSearchEngines, engine] });
    setName('');
    setUrl('');
  }

  function removeEngine(id: string): void {
    setPref({
      customSearchEngines: prefs.customSearchEngines.filter((e) => e.id !== id),
      // If the removed engine was the selected default, fall back to the built-in default.
      ...(prefs.searchEngineId === id ? { searchEngineId: DEFAULT_SEARCH_ENGINE_ID } : {}),
    });
  }

  return (
    <div className="space-y-6">
      <Card>
        <Input
          id="homepage-url"
          label={s.homepageLabel}
          hint={s.homepageDesc}
          placeholder={s.homepagePlaceholder}
          value={prefs.homepageUrl}
          onChange={(e) => {
            setPref({ homepageUrl: e.target.value });
          }}
        />
      </Card>

      <Card title={s.searchEngineLabel} subtitle={s.searchEngineDesc}>
        <Select
          id="search-engine"
          value={prefs.searchEngineId}
          onChange={(v) => {
            setPref({ searchEngineId: v });
          }}
        >
          {engines.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </Select>

        {prefs.customSearchEngines.length > 0 && (
          <ul className="mt-4 space-y-2">
            {prefs.customSearchEngines.map((e) => (
              <li
                key={e.id}
                className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2"
              >
                <div className="min-w-0">
                  <div className="text-sm font-medium text-text-primary">{e.name}</div>
                  <div className="truncate text-xs text-text-secondary">{e.searchUrlTemplate}</div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    removeEngine(e.id);
                  }}
                >
                  {s.searchEngineRemove}
                </Button>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-4 space-y-2">
          <span className="block text-sm font-medium text-text-primary">{s.searchEngineCustom}</span>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <Input
              id="custom-engine-name"
              label={s.searchEngineCustomName}
              placeholder={s.searchEngineCustomName}
              value={name}
              onChange={(e) => {
                setName(e.target.value);
              }}
            />
            <Input
              id="custom-engine-url"
              label={s.searchEngineCustomUrl}
              placeholder={s.searchEngineCustomUrlPlaceholder}
              value={url}
              {...(urlInvalid ? { error: s.searchEngineCustomInvalid } : {})}
              onChange={(e) => {
                setUrl(e.target.value);
              }}
            />
            <Button size="sm" variant="outline" disabled={!canAdd} onClick={addEngine}>
              {s.searchEngineCustomAdd}
            </Button>
          </div>
          <p className="text-xs text-text-secondary">{s.searchEngineCustomUrlHint}</p>
        </div>
      </Card>
    </div>
  );
}

/**
 * File operations: the folder whitelist that sandboxes the AI assistant's file tools. Each folder
 * carries a permission mode (read / read-write / full) and a recursive flag; the grant's mode is the
 * authorization (an op within it runs without asking, beyond it the assistant must request approval).
 * The list is persisted in `prefs.fileAccessGrants`; the main process reconciles the live access policy.
 */
export function FileOperationsSection({
  prefs,
  setPref,
}: {
  prefs: Preferences;
  setPref: (patch: Partial<Preferences>) => void;
}) {
  const s = useT(settingsDict);
  const f = s.fileOps;
  const [warn, setWarn] = useState('');
  const grants = prefs.fileAccessGrants;

  async function addFolder(): Promise<void> {
    setWarn('');
    const res = await window.tepegoz.pickFileAccessFolder();
    if (res.cancelled) return;
    const additions: FileAccessGrant[] = [];
    for (const path of res.paths) {
      const dupe = grants.some((g) => g.path === path) || additions.some((g) => g.path === path);
      if (dupe) setWarn(f.duplicate);
      else additions.push({ path, mode: 'read', recursive: true });
    }
    if (additions.length > 0) setPref({ fileAccessGrants: [...grants, ...additions] });
  }

  function updateGrant(path: string, patch: Partial<FileAccessGrant>): void {
    setPref({ fileAccessGrants: grants.map((g) => (g.path === path ? { ...g, ...patch } : g)) });
  }

  function removeGrant(path: string): void {
    setPref({ fileAccessGrants: grants.filter((g) => g.path !== path) });
  }

  return (
    <Card title={f.title} subtitle={f.subtitle}>
      <Toggle
        id="file-ops-enabled"
        label={f.enable}
        description={f.enableDesc}
        checked={prefs.fileOperationsEnabled}
        onChange={(v) => {
          setPref({ fileOperationsEnabled: v });
        }}
      />

      <div
        className={cn(
          'mt-5 space-y-3',
          !prefs.fileOperationsEnabled && 'pointer-events-none opacity-50',
        )}
      >
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-text-secondary">{f.modeHint}</p>
          <Button size="sm" variant="outline" onClick={() => void addFolder()}>
            {f.addFolder}
          </Button>
        </div>

        {grants.length === 0 ? (
          <p className="rounded-md border border-dashed border-border px-3 py-6 text-center text-sm text-text-secondary">
            {f.noFolders}
          </p>
        ) : (
          <ul className="space-y-2">
            {grants.map((g) => (
              <li
                key={g.path}
                className="flex flex-col gap-2 rounded-md border border-border px-3 py-2 sm:flex-row sm:items-center"
              >
                <span
                  className="min-w-0 flex-1 truncate font-mono text-xs text-text-primary"
                  title={g.path}
                >
                  {g.path}
                </span>
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-1.5 text-xs text-text-secondary">
                    <input
                      type="checkbox"
                      checked={g.recursive}
                      onChange={(e) => {
                        updateGrant(g.path, { recursive: e.target.checked });
                      }}
                    />
                    {f.recursive}
                  </label>
                  <select
                    aria-label={f.modeLabel}
                    value={g.mode}
                    onChange={(e) => {
                      updateGrant(g.path, { mode: e.target.value as FileAccessMode });
                    }}
                    className="h-8 rounded-md border border-border bg-surface-raised px-2 text-xs text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                  >
                    {FILE_ACCESS_MODES.map((m) => (
                      <option key={m} value={m}>
                        {f.modes[m]}
                      </option>
                    ))}
                  </select>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      removeGrant(g.path);
                    }}
                  >
                    {f.remove}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
        {warn.length > 0 && <p className="text-xs text-amber-500">{warn}</p>}
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
          <Button size="sm" variant="outline" onClick={() => open('https://github.com/kuraykaraaslan')}>
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
  onAdd: (c: { url: string; username: string; password: string; title?: string; notes?: string }) => Promise<void>;
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
