import { useEffect, useState, type ReactNode } from 'react';
import { Button, Modal } from '@tepegoz/ui';
import { SCHEDULE_PRESETS, type SchedulePreset } from '@tepegoz/tasks';
import { useT } from '@tepegoz/i18n/react';
import { tasksDict } from './i18n';
import type { TasksHostApi } from './types';
import { blankFormState, buildSaveInput, type TaskFormState } from './tasks-page-model';

const INPUT =
  'h-10 w-full rounded-md border border-border bg-surface-base px-3 text-sm text-text-primary ' +
  'placeholder:text-text-disabled focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus';
const TEXTAREA =
  'w-full rounded-md border border-border bg-surface-base px-3 py-2 text-sm leading-5 text-text-primary ' +
  'placeholder:text-text-disabled focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus';

interface TaskModalProps {
  api: TasksHostApi;
  initial: TaskFormState | null;
  onClose: () => void;
  onSaved: () => void;
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

export function TaskModal({ api, initial, onClose, onSaved }: TaskModalProps) {
  const t = useT(tasksDict);
  const [form, setForm] = useState<TaskFormState>(blankFormState);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (initial !== null) {
      setForm(initial);
      setError(null);
    }
  }, [initial]);

  const patch = (next: Partial<TaskFormState>): void => setForm((prev) => ({ ...prev, ...next }));

  async function save(): Promise<void> {
    const result = buildSaveInput(form);
    if (!result.ok) {
      setError(
        result.error === 'name'
          ? t.modal.nameRequired
          : result.error === 'prompt'
            ? t.modal.promptRequired
            : t.modal.invalidUrl,
      );
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.saveTask(result.input);
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error && err.message.length > 0 ? err.message : t.modal.saveFailed);
    } finally {
      setBusy(false);
    }
  }

  const presetLabel: Record<SchedulePreset, string> = {
    continuous: t.schedule.continuous,
    interval: t.schedule.interval,
    pageChange: t.schedule.pageChange,
  };
  const presetHint: Record<SchedulePreset, string> = {
    continuous: t.schedule.continuousHint,
    interval: t.schedule.intervalHint,
    pageChange: t.schedule.pageChangeHint,
  };

  return (
    <Modal
      open={initial !== null}
      onClose={onClose}
      title={form.id !== undefined ? t.modal.editTitle : t.modal.createTitle}
      size="md"
    >
      <div className="mt-4 max-h-[70vh] space-y-4 overflow-auto pr-1">
        <Field label={t.modal.name}>
          <input
            type="text"
            value={form.name}
            disabled={busy}
            onChange={(e) => patch({ name: e.target.value })}
            className={INPUT}
          />
        </Field>

        <Field label={t.modal.prompt} hint={t.modal.promptHint}>
          <textarea
            rows={4}
            value={form.prompt}
            disabled={busy}
            onChange={(e) => patch({ prompt: e.target.value })}
            className={TEXTAREA}
          />
        </Field>

        <Field label={t.modal.targetUrl} hint={t.modal.targetUrlHint}>
          <input
            type="url"
            value={form.targetUrl}
            disabled={busy}
            placeholder="https://"
            onChange={(e) => patch({ targetUrl: e.target.value })}
            className={INPUT}
          />
        </Field>

        {/* Schedule preset */}
        <div className="space-y-2">
          <span className="block text-sm font-medium text-text-primary">{t.schedule.label}</span>
          <div className="flex flex-wrap gap-2">
            {SCHEDULE_PRESETS.map((preset) => (
              <Button
                key={preset}
                size="sm"
                variant={form.preset === preset ? 'primary' : 'outline'}
                onClick={() => patch({ preset })}
              >
                {presetLabel[preset]}
              </Button>
            ))}
          </div>
          <p className="text-xs text-text-secondary">{presetHint[form.preset]}</p>

          {(form.preset === 'interval' || form.preset === 'pageChange') && (
            <Field label={t.schedule.everyMinutes} hint={t.schedule.minInterval}>
              <input
                type="number"
                min={5}
                value={form.everyMinutes}
                disabled={busy}
                onChange={(e) => patch({ everyMinutes: Number(e.target.value) })}
                className={`${INPUT} w-32`}
              />
            </Field>
          )}

          {form.preset === 'pageChange' && (
            <>
              <Field label={t.schedule.selector} hint={t.schedule.selectorHint}>
                <input
                  type="text"
                  value={form.selector}
                  disabled={busy}
                  placeholder=".price, #status"
                  onChange={(e) => patch({ selector: e.target.value })}
                  className={INPUT}
                />
              </Field>
              <Field label={t.schedule.changeMode}>
                <select
                  value={form.changeMode}
                  disabled={busy}
                  onChange={(e) =>
                    patch({
                      changeMode: e.target.value === 'elementText' ? 'elementText' : 'textHash',
                    })
                  }
                  className={INPUT}
                >
                  <option value="textHash">{t.schedule.changeModeTextHash}</option>
                  <option value="elementText">{t.schedule.changeModeElementText}</option>
                </select>
              </Field>
            </>
          )}
        </div>

        {/* Autonomy */}
        <div className="space-y-2">
          <span className="block text-sm font-medium text-text-primary">{t.autonomy.label}</span>
          <div className="grid gap-2 sm:grid-cols-2">
            {(['notify', 'sameOriginWrites'] as const).map((level) => {
              const selected = form.autonomy === level;
              return (
                <button
                  key={level}
                  type="button"
                  disabled={busy}
                  onClick={() => patch({ autonomy: level })}
                  className={
                    'rounded-md border px-3 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus ' +
                    (selected
                      ? 'border-primary bg-primary-subtle text-text-primary'
                      : 'border-border bg-surface-base text-text-secondary hover:bg-surface-overlay')
                  }
                >
                  <span className="block text-sm font-medium text-text-primary">
                    {level === 'notify' ? t.autonomy.notify : t.autonomy.sameOrigin}
                  </span>
                  <span className="mt-0.5 block text-xs text-text-secondary">
                    {level === 'notify' ? t.autonomy.notifyHint : t.autonomy.sameOriginHint}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {error !== null && <p className="text-xs text-error">{error}</p>}
      </div>

      <div className="mt-4 flex justify-end gap-2">
        <Button size="sm" variant="ghost" disabled={busy} onClick={onClose}>
          {t.actions.cancel}
        </Button>
        <Button size="sm" loading={busy} onClick={() => void save()}>
          {t.actions.save}
        </Button>
      </div>
    </Modal>
  );
}
