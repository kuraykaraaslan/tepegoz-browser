import { useEffect, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faGripVertical } from '@fortawesome/free-solid-svg-icons';
import { settingsDict } from '@tepegoz/settings-ui';
import { AlertBanner, Badge, Button, Card, cn, Input, Toggle } from '@tepegoz/ui';
import { coreDict } from '@tepegoz/i18n';
import { useT } from '@tepegoz/i18n/react';
import { isRunnableProvider } from '@tepegoz/desktop-ipc';
import type {
  AIAdaptor,
  AIAdaptorAction,
  LocalModelInfo,
  McpServerState,
  McpServerStatusInfo,
  Preferences,
  ProviderId,
  ProviderKeyMeta,
} from '@tepegoz/desktop-ipc';
import { PROVIDERS, Select } from './settings-shared';
import { ToolMetadataBadges } from './settings-tool-metadata';

/**
 * AI & Agent settings panels: providers/keys, on-device models, cost/local-actions, and MCP
 * connections. Split out of `SettingsPage.tsx` (ADR-0010 250-line cap).
 */

type Notify = (variant: 'success' | 'error', message: string) => void;

/** Read-only list of configured MCP servers + their live connection state (polled while open). */
export function McpConnectionsSection({
  getMcpStatus,
  labels,
}: {
  getMcpStatus: () => Promise<McpServerStatusInfo[]>;
  labels: {
    empty: string;
    tools: string;
    stateLabel: Record<McpServerState, string>;
  };
}) {
  const [servers, setServers] = useState<McpServerStatusInfo[]>([]);
  useEffect(() => {
    let alive = true;
    const load = (): void => {
      void getMcpStatus().then(
        (s) => {
          if (alive) setServers(s);
        },
        () => {
          /* status unavailable — leave the list as-is */
        },
      );
    };
    load();
    const id = setInterval(load, 3000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [getMcpStatus]);

  if (servers.length === 0) {
    return <p className="text-sm text-text-secondary">{labels.empty}</p>;
  }
  return (
    <div className="space-y-3">
      {servers.map((srv) => (
        <div key={srv.id} className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <span className="text-sm font-medium text-text-primary">{srv.label}</span>
            <span className="ml-2 text-xs text-text-secondary">
              {srv.transport}
              {srv.state === 'ready' ? ` · ${String(srv.toolCount)} ${labels.tools}` : ''}
            </span>
          </div>
          <Badge
            variant={srv.state === 'ready' ? 'success' : srv.state === 'error' ? 'error' : 'neutral'}
            dot
          >
            {labels.stateLabel[srv.state]}
          </Badge>
        </div>
      ))}
    </div>
  );
}

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

/**
 * On-device models — download/select/delete GGUF models the agent can run locally. The catalog +
 * live install/download state come from the main process over IPC (`listLocalModels` +
 * `onLocalModelsState`); models download into the profile via node-llama-cpp, not bundled.
 */
export function LocalModelsSection() {
  const s = useT(settingsDict);
  const c = useT(coreDict);
  const [models, setModels] = useState<LocalModelInfo[]>([]);

  useEffect(() => {
    void window.tepegoz.listLocalModels().then(setModels, () => {
      setModels([]);
    });
    return window.tepegoz.onLocalModelsState(setModels);
  }, []);

  return (
    <Card title={s.localModels.title} subtitle={s.localModels.hint}>
      {models.length === 0 ? (
        <p className="text-sm text-text-secondary">{s.localModels.empty}</p>
      ) : (
        <ul className="space-y-2">
          {models.map((m) => (
            <li
              key={m.id}
              className="flex items-center gap-3 rounded-md border border-border px-3 py-2"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-text-primary">{m.name}</span>
                  {m.recommended && (
                    <Badge variant="success" size="sm">
                      {s.localModels.recommended}
                    </Badge>
                  )}
                  {m.selected && (
                    <Badge variant="primary" size="sm" dot>
                      {s.localModels.selected}
                    </Badge>
                  )}
                </div>
                <span className="text-xs text-text-secondary">
                  {m.paramsB}
                  {s.localModels.paramsUnit} · {m.ctx.toLocaleString()} {s.localModels.ctxUnit}
                </span>
                {m.downloading && (
                  <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-surface-sunken">
                    <div
                      className="h-full bg-primary transition-[width] duration-300"
                      style={{ width: `${String(Math.round(m.progress * 100))}%` }}
                    />
                  </div>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                {m.downloading ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      window.tepegoz.cancelLocalModelDownload(m.id);
                    }}
                  >
                    {c.common.cancel}
                  </Button>
                ) : m.installed ? (
                  <>
                    {!m.selected && (
                      <Button
                        size="sm"
                        onClick={() => {
                          void window.tepegoz
                            .selectLocalModel(m.id)
                            .then(() => window.tepegoz.listLocalModels())
                            .then(setModels, () => undefined);
                        }}
                      >
                        {s.localModels.use}
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        void window.tepegoz.deleteLocalModel(m.id).catch(() => undefined);
                      }}
                    >
                      {s.localModels.delete}
                    </Button>
                  </>
                ) : (
                  <Button
                    size="sm"
                    onClick={() => {
                      void window.tepegoz.downloadLocalModel(m.id).catch(() => undefined);
                    }}
                  >
                    {s.localModels.download}
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/**
 * Cost & performance — a master "use a local model" toggle plus a LIVE list of AIAdaptors (system,
 * extension, and MCP groups), each shown with a kind badge and its actions, and a per-action "run on
 * device" toggle. The inventory is built from the single CapabilityRegistry over IPC (`listAiAdaptors`),
 * so it needs no maintenance as tools are added; mechanical actions (no AI step, `localCapable === false`)
 * show a muted "Native · no AI" label instead of a toggle. Danger class is badged like the Agent Console.
 */
export function LocalActionsSection({
  prefs,
  setPref,
}: {
  prefs: Preferences;
  setPref: (patch: Partial<Preferences>) => void;
}) {
  const s = useT(settingsDict);
  const [adaptors, setAdaptors] = useState<AIAdaptor[]>([]);

  useEffect(() => {
    void window.tepegoz.listAiAdaptors().then(setAdaptors, () => {
      setAdaptors([]);
    });
  }, []);

  const masterOn = prefs.useLocalModelForSimpleTasks;

  const dangerVariant: Record<AIAdaptorAction['dangerClass'], 'success' | 'warning' | 'error'> = {
    read: 'success',
    state_changing: 'warning',
    destructive: 'error',
    financial: 'error',
  };
  const kindVariant: Record<AIAdaptor['kind'], 'info' | 'neutral'> = {
    system: 'neutral',
    extension: 'info',
    mcp: 'info',
  };
  // System-adaptor titles are localized here by id; extension/MCP titles arrive already resolved.
  const adaptorTitle = (a: AIAdaptor): string =>
    a.kind === 'system' ? (s.adaptors[a.id as keyof typeof s.adaptors] ?? a.title) : a.title;

  return (
    <Card title={s.costTitle}>
      <Toggle
        id="local-model"
        label={s.localModel}
        description={s.localModelDesc}
        checked={masterOn}
        onChange={(v) => {
          setPref({
            useLocalModelForSimpleTasks: v,
            localProvider: { ...prefs.localProvider, mode: v ? 'simple' : 'off' },
          });
        }}
      />

      <p className="mb-3 mt-5 text-sm text-text-secondary">{s.localActionsHint}</p>

      {adaptors.length === 0 ? (
        <p className="text-sm text-text-secondary">{s.noActionsYet}</p>
      ) : (
        <div className="space-y-4">
          {adaptors.map((adaptor) => (
            <div key={adaptor.id}>
              <div className="mb-1.5 flex items-center gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
                  {adaptorTitle(adaptor)}
                </p>
                <Badge variant={kindVariant[adaptor.kind]}>{s.adaptorKinds[adaptor.kind]}</Badge>
              </div>
              <ul className="space-y-1.5">
                {adaptor.actions.map((a) => (
                  <li
                    key={a.id}
                    className="flex items-center gap-3 rounded-md border border-border px-3 py-2"
                  >
                    <div className="min-w-0 flex-1">
                      <span className="font-mono text-sm text-text-primary">{a.id}</span>
                      <Badge variant={dangerVariant[a.dangerClass]} className="ml-2" dot>
                        {s.dangerLabels[a.dangerClass]}
                      </Badge>
                      <ToolMetadataBadges
                        action={a}
                        labels={{ schema: s.toolSchemaLabel, idempotency: s.toolIdempotencyLabel }}
                      />
                    </div>
                    {a.localCapable ? (
                      <Toggle
                        id={`local-action-${a.id}`}
                        size="sm"
                        label={s.runLocallyLabel}
                        checked={masterOn && (prefs.localActions[a.id] ?? true)}
                        disabled={!masterOn}
                        onChange={(v) => {
                          setPref({ localActions: { ...prefs.localActions, [a.id]: v } });
                        }}
                      />
                    ) : (
                      <span className="shrink-0 text-xs text-text-disabled">{s.nativeNoAiLabel}</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

/**
 * Token budget (L7 cost transparency): the account-wide total-token quota that drives the Agent
 * Console's live quota indicator + 80% warning + pre-flight block. `0` = unlimited. The lifetime "used"
 * figure comes from the persisted SQLite Token Ledger via `getTokenUsage` (non-refunded total).
 */
export function TokenBudgetSection({
  prefs,
  setPref,
}: {
  prefs: Preferences;
  setPref: (patch: Partial<Preferences>) => void;
}) {
  const s = useT(settingsDict);
  const [used, setUsed] = useState<number | null>(null);

  useEffect(() => {
    void window.tepegoz.getTokenUsage().then(
      (u) => {
        setUsed(u.lifetimeTokens);
      },
      () => {
        setUsed(null);
      },
    );
  }, []);

  return (
    <Card title={s.tokenBudget.title}>
      <p className="mb-3 text-sm text-text-secondary">{s.tokenBudget.desc}</p>
      <div className="max-w-xs">
        <Input
          id="agent-token-quota"
          label={s.tokenBudget.label}
          type="number"
          min={0}
          value={String(prefs.agentTokenQuota)}
          onChange={(e) => {
            const n = Math.max(0, Math.trunc(Number(e.target.value) || 0));
            setPref({ agentTokenQuota: n });
          }}
        />
      </div>
      {used !== null && (
        <p className="mt-2 text-xs text-text-secondary">
          {s.tokenBudget.used}: {used.toLocaleString()}
        </p>
      )}
    </Card>
  );
}
