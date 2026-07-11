import { useState } from 'react';
import { settingsDict } from '@tepegoz/settings-ui';
import { Button, Card, cn, Toggle } from '@tepegoz/ui';
import { useT } from '@tepegoz/i18n/react';
import { FILE_ACCESS_MODES } from '@tepegoz/desktop-ipc';
import type { FileAccessGrant, FileAccessMode, Preferences } from '@tepegoz/desktop-ipc';

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
