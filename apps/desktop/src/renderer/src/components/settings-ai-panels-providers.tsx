import { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faChevronDown, faChevronUp, faGripVertical } from '@fortawesome/free-solid-svg-icons';
import { settingsDict } from '@tepegoz/settings-ui';
import { AlertBanner, Badge, Button, Card, cn, Input } from '@tepegoz/ui';
import { coreDict } from '@tepegoz/i18n';
import { useT } from '@tepegoz/i18n/react';
import { isRunnableProvider } from '@tepegoz/desktop-ipc';
import type { CredentialsStatus, ProviderId, ProviderKeyMeta } from '@tepegoz/desktop-ipc';
import { PROVIDERS, Select } from './settings-shared';
import { ConfirmAction } from './settings-confirm';
import { KeyModelMenu, useProviderModels } from './settings-ai-panels-key-model';

/**
 * AI & Agent settings panels: providers & API keys. Split out of `settings-ai-panels.tsx`
 * (ADR-0010 250-line cap).
 */

export type Notify = (variant: 'success' | 'error', message: string) => void;

/**
 * Providers & API keys. One "add" row (provider dropdown + label + key) feeds a SINGLE drag-reorderable
 * list of every stored key. Priority is order: the topmost key is the default (its provider becomes the
 * default provider). The raw key never returns — a row shows only its label + a non-secret `…last4`.
 *
 * The model is pinned PER KEY, from the gear on the key's own row — so it is offered only once the key
 * exists, and two keys for the same provider can run different models. A key's pin applies whenever a
 * run resolves to it (the top key of its provider).
 *
 * Order is also changeable from the KEYBOARD, not only by dragging. Priority decides which key a run
 * actually uses, so a drag-only control did not merely fail an accessibility guideline — it put a real
 * setting out of reach of anyone not using a mouse.
 *
 * Failures report what main said. Every path used to collapse to `errors.upstreamDown`, which turned
 * "this key was rejected" and "the vault could not be written" into the same sentence; the boundary
 * already localizes its own codes, so that text was being discarded for no gain.
 */
export function ProvidersSection({
  keys,
  encryptionAvailable,
  regions,
  onAdd,
  onRemoveById,
  onRename,
  onSetModel,
  onReorder,
  notify,
}: {
  keys: ProviderKeyMeta[];
  encryptionAvailable: boolean;
  /** provider id → selectable service regions (only multi-endpoint providers appear). */
  regions: CredentialsStatus['regions'];
  onAdd: (provider: ProviderId, label: string, apiKey: string, region?: string) => Promise<void>;
  onRemoveById: (id: string) => Promise<void>;
  onRename: (id: string, label: string) => Promise<void>;
  onSetModel: (id: string, model: string) => Promise<void>;
  onReorder: (orderedIds: string[]) => Promise<void>;
  notify: Notify;
}) {
  const s = useT(settingsDict);
  const c = useT(coreDict);
  const [provider, setProvider] = useState<ProviderId>('anthropic');
  const [label, setLabel] = useState('');
  const [keyValue, setKeyValue] = useState('');
  // The region chosen for the NEXT key. Reset to the provider's default whenever the provider changes;
  // '' both when the provider has no regions and when its first (default) region is selected — either
  // way nothing region-specific is sent.
  const [region, setRegion] = useState('');
  const providerRegionOpts = regions?.[provider] ?? [];
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [dragId, setDragId] = useState<string | null>(null);
  const modelsByProvider = useProviderModels();

  /** The reason main gave, falling back only when there genuinely is not one. */
  function reason(err: unknown): string {
    return err instanceof Error && err.message !== '' ? err.message : c.errors.upstreamDown;
  }

  async function add(): Promise<void> {
    const key = keyValue.trim();
    if (key.length === 0) return;
    const lbl = label.trim().length > 0 ? label.trim() : s.providerNames[provider];
    try {
      await onAdd(provider, lbl, key, region !== '' ? region : undefined);
      setLabel('');
      setKeyValue('');
      notify('success', s.keyAdded);
    } catch (err) {
      notify('error', reason(err));
    }
  }

  async function remove(id: string): Promise<void> {
    try {
      await onRemoveById(id);
      notify('success', s.keyRemoved);
    } catch (err) {
      notify('error', reason(err));
    }
  }

  async function setKeyModel(id: string, next: string): Promise<void> {
    try {
      await onSetModel(id, next);
      notify('success', s.keyModel.saved);
    } catch (err) {
      notify('error', reason(err));
    }
  }

  async function commitRename(id: string): Promise<void> {
    const lbl = renameDraft.trim();
    if (lbl.length === 0) return;
    try {
      await onRename(id, lbl);
      setRenamingId(null);
      notify('success', s.keyRenamed);
    } catch (err) {
      notify('error', reason(err));
    }
  }

  /** The one reorder path. Drag and the arrow buttons both land here, so they cannot diverge. */
  function move(from: number, to: number): void {
    if (from < 0 || to < 0 || from === to || to >= keys.length) return;
    const ids = keys.map((k) => k.id);
    const [moved] = ids.splice(from, 1);
    if (moved === undefined) return;
    ids.splice(to, 0, moved);
    void onReorder(ids).then(
      () => {
        notify('success', s.keysReordered);
      },
      (err: unknown) => {
        notify('error', reason(err));
      },
    );
  }

  function drop(targetId: string): void {
    const from = keys.findIndex((k) => k.id === dragId);
    const to = keys.findIndex((k) => k.id === targetId);
    setDragId(null);
    move(from, to);
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
              setRegion(''); // '' = the new provider's default endpoint
            }}
          >
            {PROVIDERS.map((p) => (
              <option key={p} value={p}>
                {s.providerNames[p]}
              </option>
            ))}
          </Select>
        </div>
        {providerRegionOpts.length > 0 && (
          <div className="w-44">
            <Select
              id="region-select"
              label={s.regionSelectLabel}
              value={region === '' ? (providerRegionOpts[0]?.id ?? '') : region}
              onChange={(v) => {
                // Store '' when the default (first) region is picked, so nothing region-specific is sent.
                setRegion(v === providerRegionOpts[0]?.id ? '' : v);
              }}
            >
              {providerRegionOpts.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </Select>
          </div>
        )}
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
        {/* h-[38px] is the shared control-box height — matches the Input/Select boxes so the row
            bottom-aligns cleanly (their wrappers only add a label above). */}
        <Button
          type="submit"
          size="sm"
          className="h-[38px]"
          disabled={!encryptionAvailable || keyValue.trim().length === 0}
        >
          {s.addKey}
        </Button>
      </form>

      {keys.length === 0 ? (
        <p className="mt-4 text-sm text-text-secondary">{s.noKeysYet}</p>
      ) : (
        <>
          <p className="mb-2 mt-5 text-xs text-text-secondary">
            {s.reorderHint} {s.keyModel.hint}
          </p>
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
                  {/* The keyboard route to the same reorder. Labelled per key, because "Move up" on
                      its own tells a screen-reader user nothing about WHICH key is moving. */}
                  <span className="flex shrink-0 flex-col">
                    <button
                      type="button"
                      disabled={index === 0}
                      aria-label={s.moveUp.replace('{name}', k.label)}
                      onClick={() => {
                        move(index, index - 1);
                      }}
                      className="rounded px-1 text-text-secondary hover:text-text-primary disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                    >
                      <FontAwesomeIcon icon={faChevronUp} className="h-2.5 w-2.5" />
                    </button>
                    <button
                      type="button"
                      disabled={index === keys.length - 1}
                      aria-label={s.moveDown.replace('{name}', k.label)}
                      onClick={() => {
                        move(index, index + 1);
                      }}
                      className="rounded px-1 text-text-secondary hover:text-text-primary disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                    >
                      <FontAwesomeIcon icon={faChevronDown} className="h-2.5 w-2.5" />
                    </button>
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
                        {k.region !== undefined && k.region !== '' && (
                          <span className="ml-2 text-xs text-text-secondary">
                            {regions?.[k.provider]?.find((r) => r.id === k.region)?.label ?? k.region}
                          </span>
                        )}
                        {k.provider !== undefined && !isRunnableProvider(k.provider) && (
                          <span className="ml-2 text-xs text-text-disabled">
                            {s.providerNotUsableYet}
                          </span>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <KeyModelMenu
                          keyId={k.id}
                          models={modelsByProvider.get(k.provider)}
                          value={k.model}
                          onChange={(v) => void setKeyModel(k.id, v)}
                        />
                        {/* The badge KEEPS its slot on every row (visibility, not conditional
                            rendering) so the model pickers line up in one column down the list. */}
                        <span className={cn('shrink-0', index !== 0 && 'invisible')}>
                          <Badge variant="success" dot>
                            {s.defaultBadge}
                          </Badge>
                        </span>
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
                        <ConfirmAction
                          label={s.remove}
                          title={s.keyRemoveTitle}
                          body={s.keyRemoveBody.replace('{name}', k.label)}
                          confirmLabel={s.remove}
                          onConfirm={() => void remove(k.id)}
                        />
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
