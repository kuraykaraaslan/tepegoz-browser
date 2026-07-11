import { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faGripVertical } from '@fortawesome/free-solid-svg-icons';
import { settingsDict } from '@tepegoz/settings-ui';
import { AlertBanner, Badge, Button, Card, cn, Input } from '@tepegoz/ui';
import { coreDict } from '@tepegoz/i18n';
import { useT } from '@tepegoz/i18n/react';
import { isRunnableProvider } from '@tepegoz/desktop-ipc';
import type { ProviderId, ProviderKeyMeta } from '@tepegoz/desktop-ipc';
import { PROVIDERS, Select } from './settings-shared';

/**
 * AI & Agent settings panels: providers & API keys. Split out of `settings-ai-panels.tsx`
 * (ADR-0010 250-line cap).
 */

export type Notify = (variant: 'success' | 'error', message: string) => void;

/**
 * Providers & API keys. One "add" row (provider dropdown + label + key) feeds a SINGLE drag-reorderable
 * list of every stored key. Priority is order: the topmost key is the default (its provider becomes the
 * default provider). The raw key never returns — a row shows only its label + a non-secret `…last4`.
 */
export function ProvidersSection({
  keys,
  encryptionAvailable,
  onAdd,
  onRemoveById,
  onRename,
  onReorder,
  notify,
}: {
  keys: ProviderKeyMeta[];
  encryptionAvailable: boolean;
  onAdd: (provider: ProviderId, label: string, apiKey: string) => Promise<void>;
  onRemoveById: (id: string) => Promise<void>;
  onRename: (id: string, label: string) => Promise<void>;
  onReorder: (orderedIds: string[]) => Promise<void>;
  notify: Notify;
}) {
  const s = useT(settingsDict);
  const c = useT(coreDict);
  const [provider, setProvider] = useState<ProviderId>('anthropic');
  const [label, setLabel] = useState('');
  const [keyValue, setKeyValue] = useState('');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [dragId, setDragId] = useState<string | null>(null);

  async function add(): Promise<void> {
    const key = keyValue.trim();
    if (key.length === 0) return;
    const lbl = label.trim().length > 0 ? label.trim() : s.providerNames[provider];
    try {
      await onAdd(provider, lbl, key);
      setLabel('');
      setKeyValue('');
      notify('success', s.keyAdded);
    } catch {
      notify('error', c.errors.upstreamDown);
    }
  }

  async function remove(id: string): Promise<void> {
    try {
      await onRemoveById(id);
      notify('success', s.keyRemoved);
    } catch {
      notify('error', c.errors.upstreamDown);
    }
  }

  async function commitRename(id: string): Promise<void> {
    const lbl = renameDraft.trim();
    if (lbl.length === 0) return;
    try {
      await onRename(id, lbl);
      setRenamingId(null);
      notify('success', s.keyRenamed);
    } catch {
      notify('error', c.errors.upstreamDown);
    }
  }

  function drop(targetId: string): void {
    const from = keys.findIndex((k) => k.id === dragId);
    const to = keys.findIndex((k) => k.id === targetId);
    setDragId(null);
    if (from < 0 || to < 0 || from === to) return;
    const ids = keys.map((k) => k.id);
    const [moved] = ids.splice(from, 1);
    if (moved === undefined) return;
    ids.splice(to, 0, moved);
    void onReorder(ids).then(
      () => {
        notify('success', s.keysReordered);
      },
      () => {
        notify('error', c.errors.upstreamDown);
      },
    );
  }

  return (
    <Card title={s.providersTitle} subtitle={s.providersSubtitle}>
      {!encryptionAvailable && (
        <AlertBanner variant="error" message={s.encryptionUnavailable} className="mb-4" />
      )}

      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void add();
        }}
      >
        <div className="w-44">
          <Select
            id="provider-select"
            label={s.providerSelectLabel}
            value={provider}
            onChange={(v) => {
              setProvider(v as ProviderId);
            }}
          >
            {PROVIDERS.map((p) => (
              <option key={p} value={p}>
                {s.providerNames[p]}
              </option>
            ))}
          </Select>
        </div>
        <div className="w-36">
          <Input
            id="key-label"
            label={s.keyLabel}
            placeholder={s.keyLabelPlaceholder}
            value={label}
            disabled={!encryptionAvailable}
            onChange={(e) => {
              setLabel(e.target.value);
            }}
          />
        </div>
        <div className="min-w-48 flex-1">
          <Input
            id="key-value"
            label={s.apiKey}
            type="password"
            placeholder={s.apiKeyPlaceholder}
            value={keyValue}
            disabled={!encryptionAvailable}
            showPasswordLabel={c.common.showPassword}
            hidePasswordLabel={c.common.hidePassword}
            onChange={(e) => {
              setKeyValue(e.target.value);
            }}
          />
        </div>
        {/* h-[38px] + mb-1 aligns the button box with the Input/Select boxes, whose wrappers
            add a label above and a ~4px hint gap below (space-y-1). */}
        <Button
          type="submit"
          size="sm"
          className="mb-1 h-[38px]"
          disabled={!encryptionAvailable || keyValue.trim().length === 0}
        >
          {s.addKey}
        </Button>
      </form>

      {keys.length === 0 ? (
        <p className="mt-4 text-sm text-text-secondary">{s.noKeysYet}</p>
      ) : (
        <>
          <p className="mb-2 mt-5 text-xs text-text-secondary">{s.reorderHint}</p>
          <ul className="space-y-1.5">
            {keys.map((k, index) => {
              const isRenaming = renamingId === k.id;
              return (
                <li
                  key={k.id}
                  draggable={!isRenaming}
                  onDragStart={() => {
                    setDragId(k.id);
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                  }}
                  onDrop={() => {
                    drop(k.id);
                  }}
                  className={cn(
                    'flex items-center gap-2 rounded-md border border-border px-3 py-2',
                    dragId === k.id && 'opacity-50',
                  )}
                >
                  <span className="cursor-grab text-text-secondary" aria-hidden>
                    <FontAwesomeIcon icon={faGripVertical} className="h-3.5 w-3.5" />
                  </span>
                  {isRenaming ? (
                    <form
                      className="flex flex-1 items-center gap-2"
                      onSubmit={(e) => {
                        e.preventDefault();
                        void commitRename(k.id);
                      }}
                    >
                      <Input
                        id={`rename-${k.id}`}
                        label={s.keyLabel}
                        value={renameDraft}
                        onChange={(e) => {
                          setRenameDraft(e.target.value);
                        }}
                      />
                      <Button type="submit" size="sm" disabled={renameDraft.trim().length === 0}>
                        {c.common.save}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setRenamingId(null);
                        }}
                      >
                        {s.cancel}
                      </Button>
                    </form>
                  ) : (
                    <>
                      <div className="min-w-0 flex-1">
                        <span className="text-sm font-medium text-text-primary">{k.label}</span>
                        {k.last4.length > 0 && (
                          <span className="ml-2 font-mono text-xs text-text-secondary">
                            …{k.last4}
                          </span>
                        )}
                        <span className="ml-2 text-xs text-text-secondary">
                          {s.providerNames[k.provider]}
                        </span>
                        {k.provider !== undefined && !isRunnableProvider(k.provider) && (
                          <span className="ml-2 text-xs text-text-disabled">
                            {s.providerNotUsableYet}
                          </span>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {index === 0 && (
                          <Badge variant="success" dot>
                            {s.defaultBadge}
                          </Badge>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setRenamingId(k.id);
                            setRenameDraft(k.label);
                          }}
                        >
                          {s.rename}
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => void remove(k.id)}>
                          {s.remove}
                        </Button>
                      </div>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </Card>
  );
}
