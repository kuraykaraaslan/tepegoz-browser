import { useState } from 'react';
import { settingsDict } from '@tepegoz/settings-ui';
import { Button, Card, cn, Toggle } from '@tepegoz/ui';
import { useT } from '@tepegoz/i18n/react';
import { ConfirmAction } from './settings-confirm';
import { Select } from './settings-shared';
import { FILE_ACCESS_MODES } from '@tepegoz/desktop-ipc';
import type { FileAccessGrant, FileAccessMode, Preferences } from '@tepegoz/desktop-ipc';

/**
 * File operations: the folder whitelist that sandboxes the AI assistant's file tools. Each folder
 * carries a permission mode (read / read-write / full) and a recursive flag; the grant's mode is the
 * authorization (an op within it runs without asking, beyond it the assistant must request approval).
 * The list is persisted in `prefs.fileAccessGrants`; the main process reconciles the live access policy.
 *
 * When the master switch is off the grant list used to be `pointer-events-none opacity-50`, which
 * blocks the MOUSE and nothing else: every control stayed in the tab order and still worked from the
 * keyboard. On a screen that hands an AI assistant access to folders, "looks disabled" is not a state
 * this may be left in — the controls are really disabled now, and `aria-disabled` on the group says so
 * to anything not looking at the pixels.
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
  const enabled = prefs.fileOperationsEnabled;

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
        className={cn('mt-5 space-y-3', !enabled && 'opacity-50')}
        aria-disabled={!enabled}
      >
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-text-secondary">{f.modeHint}</p>
          <Button
            size="sm"
            variant="outline"
            disabled={!enabled}
            onClick={() => void addFolder()}
          >
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
                      disabled={!enabled}
                      onChange={(e) => {
                        updateGrant(g.path, { recursive: e.target.checked });
                      }}
                    />
                    {f.recursive}
                  </label>
                  <div className="w-32">
                    <Select
                      id={`file-access-mode-${g.path}`}
                      ariaLabel={`${g.path} — ${f.modeLabel}`}
                      disabled={!enabled}
                      value={g.mode}
                      onChange={(mode) => {
                        updateGrant(g.path, { mode: mode as FileAccessMode });
                      }}
                    >
                      {FILE_ACCESS_MODES.map((m) => (
                        <option key={m} value={m}>
                          {f.modes[m]}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <ConfirmAction
                    label={f.remove}
                    title={f.removeTitle}
                    body={f.removeBody.replace('{path}', g.path)}
                    confirmLabel={f.remove}
                    disabled={!enabled}
                    onConfirm={() => {
                      removeGrant(g.path);
                    }}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
        {warn.length > 0 && <p className="text-xs text-warning-fg">{warn}</p>}
      </div>
    </Card>
  );
}
