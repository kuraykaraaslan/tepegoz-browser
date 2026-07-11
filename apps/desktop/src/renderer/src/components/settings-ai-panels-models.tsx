import { useEffect, useState } from 'react';
import { settingsDict } from '@tepegoz/settings-ui';
import { Badge, Button, Card } from '@tepegoz/ui';
import { coreDict } from '@tepegoz/i18n';
import { useT } from '@tepegoz/i18n/react';
import type {
  AgentModelChoice,
  LocalModelInfo,
  Preferences,
  ProviderId,
} from '@tepegoz/desktop-ipc';
import { Select } from './settings-shared';

/**
 * AI & Agent settings panels: default model per provider + on-device models. Split out of
 * `settings-ai-panels.tsx` (ADR-0010 250-line cap).
 */

/**
 * Default model per provider — pins which model each provider uses for agent runs (persisted as
 * `agentModelOverride`, the SAME pref the Agent Console's Model dropdown writes). "Auto" clears the pin
 * (per-task tier routing). The selectable models come from the agent config over IPC, so this stays in
 * lockstep with the runtime's catalog without importing the model-gateway into the renderer.
 */
export function DefaultModelsSection({
  prefs,
  setPref,
}: {
  prefs: Preferences;
  setPref: (patch: Partial<Preferences>) => void;
}) {
  const s = useT(settingsDict);
  const [choices, setChoices] = useState<AgentModelChoice[]>([]);

  useEffect(() => {
    void window.tepegoz.getAgentConfig().then(
      (cfg) => {
        setChoices(cfg.choices);
      },
      () => {
        setChoices([]);
      },
    );
  }, []);

  const withModels = choices.filter((c) => c.models.length > 0);

  const setModel = (provider: ProviderId, model: string): void => {
    const next = { ...prefs.agentModelOverride };
    if (model === '') delete next[provider];
    else next[provider] = model;
    setPref({ agentModelOverride: next });
  };

  return (
    <Card title={s.defaultModels.title} subtitle={s.defaultModels.subtitle}>
      {withModels.length === 0 ? (
        <p className="text-sm text-text-secondary">{s.defaultModels.empty}</p>
      ) : (
        <div className="space-y-4">
          {withModels.map((c) => (
            <div key={c.provider} className="max-w-xs">
              <Select
                id={`default-model-${c.provider}`}
                label={c.label}
                value={prefs.agentModelOverride[c.provider] ?? ''}
                onChange={(v) => {
                  setModel(c.provider, v);
                }}
              >
                <option value="">{s.defaultModels.auto}</option>
                {c.models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </Select>
            </div>
          ))}
        </div>
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
