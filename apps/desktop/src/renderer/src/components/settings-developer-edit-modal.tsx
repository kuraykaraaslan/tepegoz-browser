import { useEffect, useState } from 'react';
import { settingsDict } from '@tepegoz/settings-ui';
import { Badge, Button, Modal, Toggle } from '@tepegoz/ui';
import { useT } from '@tepegoz/i18n/react';
import type { Preferences } from '@tepegoz/desktop-ipc';
import { DEFAULT_PREFERENCES } from '@tepegoz/preferences/model';
import {
  buildBooleanPreferencePatch,
  buildJsonPreferencePatch,
  buildStringPreferencePatch,
  editableLeaves,
  isPlainObject,
  withLeaf,
  type DeveloperPreferenceRow,
} from '../lib/developer-settings-model';

type Row = DeveloperPreferenceRow & Record<string, unknown>;

/**
 * Edit one preference from the Developer table. A boolean flips through the boolean patch builder; a
 * string / JSON value goes through the schema-validating builders so a bad value is caught here, not
 * bounced back from the IPC boundary. For an object value the field list below the JSON editor lets a
 * scalar leaf be changed without hand-editing JSON — it writes back into the same draft string, so the
 * textarea stays the single source of truth and Apply/validation are unchanged.
 */
export function PreferenceEditModal({
  row,
  onClose,
  onUpdatePrefs,
}: {
  row: Row | null;
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
    const result = buildStringPreferencePatch(row.key, draft);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    await apply(result.patch);
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

  const defaultValue = row === null ? undefined : DEFAULT_PREFERENCES[row.key];
  // Compared as JSON: these values are objects and arrays as often as scalars, and `===` on a fresh
  // array would call every list "changed" and offer a reset that does nothing.
  const isAtDefault = row !== null && JSON.stringify(row.value) === JSON.stringify(defaultValue);

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
            {row.stability !== 'stable' && (
              <Badge variant="neutral">
                {row.stability === 'experimental'
                  ? s.developerStabilityExperimental
                  : s.developerStabilityInternal}
              </Badge>
            )}
          </div>

          {row.restartRequired && (
            <p className="text-xs text-text-secondary">{s.developerRestartRequired}</p>
          )}

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
            <>
              <NestedObjectFields draft={draft} disabled={busy} onChange={setDraft} />
              <textarea
                value={draft}
                disabled={busy}
                rows={Math.min(14, Math.max(5, draft.split('\n').length))}
                onChange={(e) => setDraft(e.target.value)}
                className="w-full rounded-md border border-border bg-surface-base px-3 py-2 font-mono text-xs leading-5 text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
              />
            </>
          )}

          {error !== null && <p className="text-xs text-error">{error}</p>}

          <div className="flex justify-end gap-2">
            {/* Per-row reset. The only way back to a default used to be the global reset, which
                throws away every other preference to undo one experiment. */}
            <Button
              size="sm"
              variant="outline"
              disabled={busy || isAtDefault}
              onClick={() => {
                void apply({ [row.key]: defaultValue });
              }}
            >
              {s.developerResetRow}
            </Button>
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

/**
 * Scalar-leaf editors for an object-valued preference, above the raw JSON. A no-op unless the draft
 * parses to a plain object with at least one boolean/number/string leaf (nested objects / arrays /
 * null stay in the JSON editor). Every change re-serializes the whole object into the draft string.
 */
function NestedObjectFields({
  draft,
  disabled,
  onChange,
}: {
  draft: string;
  disabled: boolean;
  onChange: (next: string) => void;
}) {
  const s = useT(settingsDict);
  let parsed: unknown;
  try {
    parsed = JSON.parse(draft);
  } catch {
    return null;
  }
  if (!isPlainObject(parsed)) return null;
  const obj = parsed;
  const leaves = editableLeaves(obj);
  if (leaves.length === 0) return null;

  const write = (key: string, value: boolean | number | string): void => {
    onChange(JSON.stringify(withLeaf(obj, key, value), null, 2));
  };

  return (
    <div className="space-y-2 rounded-md border border-border bg-surface-sunken px-3 py-2">
      <p className="text-xs font-medium text-text-secondary">{s.developerObjectFields}</p>
      {leaves.map((leaf) => (
        <div key={leaf.key} className="flex items-center gap-3">
          <code className="w-40 shrink-0 truncate text-xs text-text-secondary" title={leaf.key}>
            {leaf.key}
          </code>
          {leaf.kind === 'boolean' ? (
            <Toggle
              id={`developer-leaf-${leaf.key}`}
              label={leaf.value ? 'true' : 'false'}
              checked={Boolean(leaf.value)}
              disabled={disabled}
              onChange={(v) => write(leaf.key, v)}
            />
          ) : (
            <input
              type={leaf.kind === 'number' ? 'number' : 'text'}
              value={String(leaf.value)}
              disabled={disabled}
              onChange={(e) => {
                if (leaf.kind === 'number') {
                  const n = Number(e.target.value);
                  if (e.target.value.trim() !== '' && Number.isFinite(n)) write(leaf.key, n);
                } else {
                  write(leaf.key, e.target.value);
                }
              }}
              className="h-8 w-full rounded border border-border bg-surface-base px-2 font-mono text-xs text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
            />
          )}
        </div>
      ))}
    </div>
  );
}
