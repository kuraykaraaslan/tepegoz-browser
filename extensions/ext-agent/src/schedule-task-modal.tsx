import { useEffect, useState, type ReactNode } from 'react';
import { Button, Modal } from '@tepegoz/ui';
import { useT } from '@tepegoz/i18n/react';
import {
  DEFAULT_INTERVAL_MINUTES,
  deriveTaskName,
  presetToTrigger,
  SCHEDULE_PRESETS,
  type SchedulePreset,
  type TaskAutonomyPreset,
  type TaskSaveInput,
} from '@tepegoz/tasks';
import { agentDict } from './i18n';
import type { AgentHostApi } from './types';

/** The Scheduled Tasks extension's internal page — where "Open tasks" jumps after saving. */
const TASKS_PAGE_URL = 'tepegoz://com.tepegoz.tasks';

const INPUT =
  'h-10 w-full rounded-md border border-border bg-surface-base px-3 text-sm text-text-primary ' +
  'placeholder:text-text-disabled focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus';
const TEXTAREA =
  'w-full rounded-md border border-border bg-surface-base px-3 py-2 text-sm leading-5 text-text-primary ' +
  'placeholder:text-text-disabled focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus';

interface ScheduleTaskModalProps {
  api: AgentHostApi;
  open: boolean;
  groupId: string | null;
  /** The chat's originating prompt, used when no persisted conversation is available yet. */
  fallbackFirstPrompt: string;
  onClose: () => void;
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="block text-sm font-medium text-text-primary">{label}</span>
      {children}
      {hint !== undefined && <span className="block text-xs text-text-secondary">{hint}</span>}
    </label>
  );
}

export function ScheduleTaskModal({ api, open, groupId, fallbackFirstPrompt, onClose }: ScheduleTaskModalProps) {
  const t = useT(agentDict).scheduleTask;
  const [conversationId, setConversationId] = useState<string | undefined>(undefined);
  const [name, setName] = useState('');
  const [prompt, setPrompt] = useState('');
  const [targetUrl, setTargetUrl] = useState('');
  const [preset, setPreset] = useState<SchedulePreset>('interval');
  const [everyMinutes, setEveryMinutes] = useState(DEFAULT_INTERVAL_MINUTES);
  const [autonomy, setAutonomy] = useState<TaskAutonomyPreset>('sameOriginWrites');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  // Seed the form from the current conversation + active tab when the modal opens.
  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    setError(null);
    setSaved(false);
    void Promise.all([
      groupId !== null ? api.getCurrentAgentConversation(groupId) : Promise.resolve(null),
      api.getActiveTabUrl(),
    ]).then(([detail, url]) => {
      if (cancelled) return;
      const firstPrompt = detail?.turns[0]?.prompt ?? fallbackFirstPrompt;
      setConversationId(detail?.summary.id);
      setName(deriveTaskName(firstPrompt));
      setPrompt(firstPrompt.trim());
      setTargetUrl(url ?? '');
    });
    return () => {
      cancelled = true;
    };
  }, [api, open, groupId, fallbackFirstPrompt]);

  async function save(): Promise<void> {
    const trimmedName = name.trim();
    const trimmedPrompt = prompt.trim();
    if (trimmedName.length === 0) {
      setError(t.nameRequired);
      return;
    }
    if (trimmedPrompt.length === 0) {
      setError(t.instructionRequired);
      return;
    }
    const url = targetUrl.trim();
    const scheduleTrigger = presetToTrigger(preset, {
      everyMinutes,
      ...(url.length > 0 ? { url } : {}),
    });
    const input: TaskSaveInput = {
      name: trimmedName,
      prompt: trimmedPrompt,
      triggers: [{ type: 'manual' }, scheduleTrigger],
      autonomy,
      ...(url.length > 0 ? { targetUrl: url } : {}),
      ...(conversationId !== undefined ? { sourceConversationId: conversationId } : {}),
    };
    setBusy(true);
    setError(null);
    try {
      await api.saveTask(input);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error && err.message.length > 0 ? err.message : t.saveFailed);
    } finally {
      setBusy(false);
    }
  }

  const presetLabel: Record<SchedulePreset, string> = {
    continuous: t.presetContinuous,
    interval: t.presetInterval,
    pageChange: t.presetPageChange,
  };

  return (
    <Modal open={open} onClose={onClose} title={t.title} size="md">
      <p className="mt-1 text-xs text-text-secondary">{t.desc}</p>

      {saved ? (
        <div className="mt-6 flex flex-col items-center gap-3 py-4">
          <p className="text-sm text-text-primary">{t.saved}</p>
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={onClose}>
              {t.cancel}
            </Button>
            <Button
              size="sm"
              onClick={() => {
                api.createTab(TASKS_PAGE_URL);
                onClose();
              }}
            >
              {t.openManager}
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div className="mt-4 max-h-[60vh] space-y-4 overflow-auto pr-1">
            <Field label={t.name}>
              <input type="text" value={name} disabled={busy} onChange={(e) => setName(e.target.value)} className={INPUT} />
            </Field>

            <Field label={t.instruction} hint={t.instructionHint}>
              <textarea
                rows={3}
                value={prompt}
                disabled={busy}
                onChange={(e) => setPrompt(e.target.value)}
                className={TEXTAREA}
              />
            </Field>

            <Field label={t.targetUrl}>
              <input
                type="url"
                value={targetUrl}
                disabled={busy}
                placeholder="https://"
                onChange={(e) => setTargetUrl(e.target.value)}
                className={INPUT}
              />
            </Field>

            <div className="space-y-2">
              <span className="block text-sm font-medium text-text-primary">{t.schedule}</span>
              <div className="flex flex-wrap gap-2">
                {SCHEDULE_PRESETS.map((value) => (
                  <Button
                    key={value}
                    size="sm"
                    variant={preset === value ? 'primary' : 'outline'}
                    onClick={() => setPreset(value)}
                  >
                    {presetLabel[value]}
                  </Button>
                ))}
              </div>
              {(preset === 'interval' || preset === 'pageChange') && (
                <Field label={t.everyMinutes} hint={t.minInterval}>
                  <input
                    type="number"
                    min={5}
                    value={everyMinutes}
                    disabled={busy}
                    onChange={(e) => setEveryMinutes(Number(e.target.value))}
                    className={`${INPUT} w-32`}
                  />
                </Field>
              )}
            </div>

            <div className="space-y-2">
              <span className="block text-sm font-medium text-text-primary">{t.autonomy}</span>
              <div className="grid gap-2 sm:grid-cols-2">
                {(['notify', 'sameOriginWrites'] as const).map((level) => {
                  const selected = autonomy === level;
                  return (
                    <button
                      key={level}
                      type="button"
                      disabled={busy}
                      onClick={() => setAutonomy(level)}
                      className={
                        'rounded-md border px-3 py-2 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus ' +
                        (selected
                          ? 'border-primary bg-primary-subtle text-text-primary'
                          : 'border-border bg-surface-base text-text-secondary hover:bg-surface-overlay')
                      }
                    >
                      {level === 'notify' ? t.autonomyNotify : t.autonomySameOrigin}
                    </button>
                  );
                })}
              </div>
            </div>

            {error !== null && <p className="text-xs text-error">{error}</p>}
          </div>

          <div className="mt-4 flex justify-end gap-2">
            <Button size="sm" variant="ghost" disabled={busy} onClick={onClose}>
              {t.cancel}
            </Button>
            <Button size="sm" loading={busy} onClick={() => void save()}>
              {t.save}
            </Button>
          </div>
        </>
      )}
    </Modal>
  );
}
