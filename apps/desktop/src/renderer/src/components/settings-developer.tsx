import { useEffect, useMemo, useState } from 'react';
import { settingsDict } from '@tepegoz/settings-ui';
import { Badge, Button, Card, DataTable, Modal, Toggle, type TableColumn } from '@tepegoz/ui';
import { useT } from '@tepegoz/i18n/react';
import type { Preferences } from '@tepegoz/desktop-ipc';
import {
  buildBooleanPreferencePatch,
  buildJsonPreferencePatch,
  buildStringPreferencePatch,
  listDeveloperPreferenceRows,
  type DeveloperPreferenceRow,
} from '../lib/developer-settings-model';
import { ChromiumFlagsCard } from './settings-developer-flags';

export interface DeveloperSectionProps {
  prefs: Preferences;
  onUpdatePrefs: (patch: Partial<Preferences>) => Promise<void>;
}

type TableRow = DeveloperPreferenceRow & Record<string, unknown>;

export function DeveloperSection({ prefs, onUpdatePrefs }: DeveloperSectionProps) {
  const s = useT(settingsDict);
  const rows = useMemo<TableRow[]>(() => listDeveloperPreferenceRows(prefs) as TableRow[], [prefs]);
  const [editing, setEditing] = useState<TableRow | null>(null);

  const columns = useMemo<TableColumn<TableRow>[]>(
    () => [
      {
        key: 'key',
        header: s.developerColumnKey,
        sortable: true,
        thClass: 'w-48',
        tdClass: 'w-48 max-w-48',
        render: (row) => (
          <code className="rounded bg-surface-sunken px-2 py-1 text-xs text-text-primary">
            {row.key}
          </code>
        ),
      },
      {
        key: 'visibility',
        header: s.developerColumnVisibility,
        sortable: true,
        thClass: 'w-24',
        tdClass: 'w-24',
        render: (row) => (
          <Badge variant={row.visibility === 'public' ? 'info' : 'neutral'}>
            {row.visibility === 'public' ? s.developerPublic : s.developerPrivate}
          </Badge>
        ),
      },
      {
        key: 'kind',
        header: s.developerColumnType,
        sortable: true,
        thClass: 'w-20',
        tdClass: 'w-20',
        render: (row) => <span className="font-mono text-xs">{row.kind}</span>,
      },
      {
        key: 'valueText',
        header: s.developerColumnValue,
        thClass: 'w-full min-w-0',
        tdClass: 'min-w-0 max-w-0',
        render: (row) => (
          <code
            title={row.valueText}
            className="block max-h-10 max-w-full overflow-hidden break-all text-xs leading-5 text-text-secondary"
          >
            {row.valueText}
          </code>
        ),
      },
      {
        key: 'actions',
        header: s.developerColumnActions,
        align: 'right',
        thClass: 'w-20',
        tdClass: 'w-20',
        render: (row) => (
          <Button size="xs" variant="outline" onClick={() => setEditing(row)}>
            {s.developerEdit}
          </Button>
        ),
      },
    ],
    [s],
  );

  return (
    <div className="space-y-4">
      <Card title={s.developerTitle} subtitle={s.developerDesc} />
      <ChromiumFlagsCard prefs={prefs} onUpdatePrefs={onUpdatePrefs} />
      <DataTable
        caption={s.developerTitle}
        rows={rows}
        columns={columns}
        searchable
        searchPlaceholder={s.developerSearchPlaceholder}
        pageSize={10}
        emptyMessage={s.noResults}
      />
      <PreferenceEditModal
        row={editing}
        onClose={() => setEditing(null)}
        onUpdatePrefs={onUpdatePrefs}
      />
    </div>
  );
}

function PreferenceEditModal({
  row,
  onClose,
  onUpdatePrefs,
}: {
  row: TableRow | null;
  onClose: () => void;
  onUpdatePrefs: (patch: Partial<Preferences>) => Promise<void>;
}) {
  const s = useT(settingsDict);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setDraft(row?.valueText ?? '');
    setError(null);
  }, [row]);

  async function apply(patch: Partial<Preferences>): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await onUpdatePrefs(patch);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : s.developerSaveFailed);
    } finally {
      setBusy(false);
    }
  }

  async function applyString(): Promise<void> {
    if (row === null) return;
    await apply(buildStringPreferencePatch(row.key, draft));
  }

  async function applyJson(): Promise<void> {
    if (row === null) return;
    const result = buildJsonPreferencePatch(row.key, draft, s.developerInvalidJson);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    await apply(result.patch);
  }

  const modalTitle = row?.key;

  return (
    <Modal
      open={row !== null}
      onClose={onClose}
      {...(modalTitle !== undefined ? { title: modalTitle } : {})}
      size="md"
    >
      {row !== null && (
        <div className="mt-4 space-y-4">
          <div className="flex flex-wrap items-center gap-2 text-xs text-text-secondary">
            <Badge variant={row.visibility === 'public' ? 'info' : 'neutral'}>
              {row.visibility === 'public' ? s.developerPublic : s.developerPrivate}
            </Badge>
            <span>
              {s.developerType}: <span className="font-mono">{row.kind}</span>
            </span>
          </div>

          {row.kind === 'boolean' && (
            <Toggle
              id={`developer-edit-${row.key}`}
              label={row.value ? 'true' : 'false'}
              checked={Boolean(row.value)}
              disabled={busy}
              onChange={(value) => {
                void apply(buildBooleanPreferencePatch(row.key, value));
              }}
            />
          )}

          {row.kind === 'string' && (
            <input
              type="text"
              value={draft}
              disabled={busy}
              onChange={(e) => setDraft(e.target.value)}
              className="h-10 w-full rounded-md border border-border bg-surface-base px-3 font-mono text-sm text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
            />
          )}

          {row.kind === 'json' && (
            <textarea
              value={draft}
              disabled={busy}
              rows={Math.min(14, Math.max(5, draft.split('\n').length))}
              onChange={(e) => setDraft(e.target.value)}
              className="w-full rounded-md border border-border bg-surface-base px-3 py-2 font-mono text-xs leading-5 text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
            />
          )}

          {error !== null && <p className="text-xs text-error">{error}</p>}

          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" disabled={busy} onClick={onClose}>
              {s.cancel}
            </Button>
            {row.kind !== 'boolean' && (
              <Button
                size="sm"
                loading={busy}
                disabled={draft === row.valueText}
                onClick={() => void (row.kind === 'string' ? applyString() : applyJson())}
              >
                {s.developerApply}
              </Button>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
