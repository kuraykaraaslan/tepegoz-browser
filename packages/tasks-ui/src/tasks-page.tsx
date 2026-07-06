import { useCallback, useEffect, useMemo, useState } from 'react';
import { useT } from '@tepegoz/i18n/react';
import {
  defaultTaskPolicy,
  type TaskArtifactRecord,
  type TaskCommandInput,
  type TaskDefinition,
  type TaskRunRecord,
  type TaskSaveInput,
  type TasksState,
} from '@tepegoz/tasks';
import { tasksDict } from './i18n';

export interface TasksPageProps {
  list: () => Promise<TaskDefinition[]>;
  save: (input: TaskSaveInput) => Promise<TaskDefinition>;
  command: (input: TaskCommandInput) => Promise<void>;
  setEnabled: (input: { id: string; enabled: boolean }) => Promise<void>;
  listRuns: (taskId?: string) => Promise<TaskRunRecord[]>;
  listArtifacts: (taskId?: string) => Promise<TaskArtifactRecord[]>;
  subscribe: (callback: (state: TasksState) => void) => () => void;
}

function fmtTime(value?: number): string {
  return value === undefined ? '-' : new Date(value).toLocaleString();
}

export function TasksPage(props: TasksPageProps) {
  const { list, listArtifacts, listRuns, subscribe } = props;
  const t = useT(tasksDict);
  const [tasks, setTasks] = useState<TaskDefinition[]>([]);
  const [runs, setRuns] = useState<TaskRunRecord[]>([]);
  const [artifacts, setArtifacts] = useState<TaskArtifactRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [prompt, setPrompt] = useState('');
  const [targetUrl, setTargetUrl] = useState('');
  const [intervalMinutes, setIntervalMinutes] = useState(15);

  const latestRuns = useMemo(() => runs.slice(0, 8), [runs]);
  const latestArtifacts = useMemo(() => artifacts.slice(0, 8), [artifacts]);

  const refresh = useCallback(async (): Promise<void> => {
    const [nextTasks, nextRuns, nextArtifacts] = await Promise.all([
      list(),
      listRuns(),
      listArtifacts(),
    ]);
    setTasks(nextTasks);
    setRuns(nextRuns);
    setArtifacts(nextArtifacts);
    setLoading(false);
  }, [list, listArtifacts, listRuns]);

  useEffect(() => {
    void refresh();
    return subscribe((state) => {
      setTasks(state.tasks);
      setRuns(state.runs);
      setArtifacts(state.artifacts);
      setLoading(false);
    });
  }, [refresh, subscribe]);

  async function saveTask(): Promise<void> {
    const trimmedName = name.trim();
    const trimmedPrompt = prompt.trim();
    if (trimmedName.length === 0 || trimmedPrompt.length === 0) return;
    await props.save({
      name: trimmedName,
      prompt: trimmedPrompt,
      targetUrl: targetUrl.trim() || undefined,
      triggers: [
        { type: 'manual' },
        { type: 'interval', enabled: true, everyMinutes: intervalMinutes },
      ],
      policy: defaultTaskPolicy(),
    });
    setName('');
    setPrompt('');
    setTargetUrl('');
    setIntervalMinutes(15);
    await refresh();
  }

  return (
    <main className="h-full overflow-auto bg-surface-system px-8 py-6 text-text-primary">
      <div className="mx-auto grid max-w-6xl grid-cols-[minmax(18rem,24rem)_1fr] gap-6">
        <section className="flex flex-col gap-3">
          <h1 className="text-xl font-semibold">{t.title}</h1>
          <div className="rounded-lg border border-border-subtle bg-surface-elevated p-4">
            <h2 className="mb-3 text-sm font-semibold">{t.createTitle}</h2>
            <label className="mb-2 block text-xs text-text-secondary">
              {t.name}
              <input
                value={name}
                onChange={(e) => setName(e.currentTarget.value)}
                className="mt-1 w-full rounded border border-border-subtle bg-surface-base px-2 py-1 text-sm"
              />
            </label>
            <label className="mb-2 block text-xs text-text-secondary">
              {t.prompt}
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.currentTarget.value)}
                rows={5}
                className="mt-1 w-full rounded border border-border-subtle bg-surface-base px-2 py-1 text-sm"
              />
            </label>
            <label className="mb-2 block text-xs text-text-secondary">
              {t.targetUrl}
              <input
                value={targetUrl}
                onChange={(e) => setTargetUrl(e.currentTarget.value)}
                className="mt-1 w-full rounded border border-border-subtle bg-surface-base px-2 py-1 text-sm"
              />
            </label>
            <label className="mb-3 block text-xs text-text-secondary">
              {t.intervalMinutes}
              <input
                type="number"
                min={5}
                value={intervalMinutes}
                onChange={(e) => setIntervalMinutes(Number(e.currentTarget.value))}
                className="mt-1 w-28 rounded border border-border-subtle bg-surface-base px-2 py-1 text-sm"
              />
            </label>
            <button
              type="button"
              onClick={() => void saveTask()}
              className="rounded bg-accent px-3 py-1.5 text-sm font-medium text-accent-contrast"
            >
              {t.save}
            </button>
          </div>
        </section>

        <section className="flex flex-col gap-4">
          {loading ? (
            <p className="text-sm text-text-secondary">{t.loading}</p>
          ) : tasks.length === 0 ? (
            <p className="text-sm text-text-secondary">{t.empty}</p>
          ) : (
            <div className="grid gap-3">
              {tasks.map((task) => (
                <article
                  key={task.id}
                  className="rounded-lg border border-border-subtle bg-surface-elevated p-4"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <h2 className="truncate text-sm font-semibold">{task.name}</h2>
                      <p className="mt-1 text-xs text-text-secondary">{task.prompt}</p>
                      <p className="mt-2 text-xs text-text-muted">
                        {t.status[task.status]} · {fmtTime(task.nextRunAt)}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          void props.command({
                            id: task.id,
                            action: 'run',
                            idempotencyKey: crypto.randomUUID(),
                          })
                        }
                        className="rounded border border-border-subtle px-2 py-1 text-xs"
                      >
                        {t.runNow}
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          void props.setEnabled({ id: task.id, enabled: task.status !== 'enabled' })
                        }
                        className="rounded border border-border-subtle px-2 py-1 text-xs"
                      >
                        {task.status === 'enabled' ? t.disable : t.enable}
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <section className="rounded-lg border border-border-subtle bg-surface-elevated p-4">
              <h2 className="mb-3 text-sm font-semibold">{t.runs}</h2>
              <div className="grid gap-2">
                {latestRuns.map((run) => (
                  <div key={run.id} className="text-xs">
                    <span className="font-medium">{t.runStatus[run.status]}</span>
                    <span className="text-text-secondary"> · {fmtTime(run.startedAt ?? run.queuedAt)}</span>
                  </div>
                ))}
              </div>
            </section>
            <section className="rounded-lg border border-border-subtle bg-surface-elevated p-4">
              <h2 className="mb-3 text-sm font-semibold">{t.artifacts}</h2>
              <div className="grid gap-2">
                {latestArtifacts.map((artifact) => (
                  <div key={artifact.id} className="text-xs">
                    <span className="font-medium">{artifact.title}</span>
                    <span className="text-text-secondary"> · {artifact.kind}</span>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </section>
      </div>
    </main>
  );
}
