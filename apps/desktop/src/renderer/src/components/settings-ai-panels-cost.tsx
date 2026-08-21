import { useEffect, useState } from 'react';
import { settingsDict } from '@tepegoz/settings-ui';
import { Badge, Card, Input, Toggle } from '@tepegoz/ui';
import { useT } from '@tepegoz/i18n/react';
import type { AIAdaptor, AIAdaptorAction, Preferences } from '@tepegoz/desktop-ipc';
import { ToolMetadataBadges } from './settings-tool-metadata';

/**
 * AI & Agent settings panels: cost/local-actions + token budget. Split out of
 * `settings-ai-panels.tsx` (ADR-0010 250-line cap).
 */

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
                      <span className="shrink-0 text-xs text-text-disabled">
                        {s.nativeNoAiLabel}
                      </span>
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
