import { useMemo, useState } from 'react';
import { settingsDict } from '@tepegoz/settings-ui';
import { Badge, Button, Card, DataTable, type TableColumn } from '@tepegoz/ui';
import { useT } from '@tepegoz/i18n/react';
import type { Preferences } from '@tepegoz/desktop-ipc';
import {
  listDeveloperPreferenceRows,
  type DeveloperPreferenceRow,
} from '../lib/developer-settings-model';
import { ChromiumFlagsCard } from './settings-developer-flags';
import { PreferenceEditModal } from './settings-developer-edit-modal';
import { WebContentDefaultsCard } from './settings-developer-web-content';

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
          <div className="flex flex-col gap-1">
            <code className="rounded bg-surface-sunken px-2 py-1 text-xs text-text-primary">
              {row.key}
            </code>
            {row.stability !== 'stable' && (
              <span>
                <Badge variant="neutral">
                  {row.stability === 'experimental'
                    ? s.developerStabilityExperimental
                    : s.developerStabilityInternal}
                </Badge>
              </span>
            )}
          </div>
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
      <WebContentDefaultsCard />
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
