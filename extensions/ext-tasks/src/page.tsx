import { useCallback, useEffect, useMemo, useState } from 'react';
import { Badge, Button, Card, DataTable, type TableColumn } from '@tepegoz/ui';
import { useT } from '@tepegoz/i18n/react';
import type { AgentConversationDetail } from '@tepegoz/ext-agent/history';
import type {
  TaskArtifactRecord,
  TaskDefinition,
  TaskRunRecord,
  TasksState,
} from '@tepegoz/tasks';
import { tasksDict } from './i18n';
import type { TasksHostApi } from './types';
import { TaskModal } from './task-modal';
import { ConversationPicker } from './conversation-picker';
import {
  blankFormState,
  fmtTime,
  formStateFromConversation,
  formStateFromTask,
  runStatusVariant,
  toTaskRows,
  type TaskFormState,
  type TaskRow,
} from './tasks-page-model';

/** The Agent extension's internal history page — where "View chat" jumps to. */
const AGENT_PAGE_URL = 'tepegoz://com.tepegoz.agent';

export function TasksPage({ api }: Readonly<{ api: TasksHostApi; onClose: () => void }>) {
  const t = useT(tasksDict);
  const [tasks, setTasks] = useState<TaskDefinition[]>([]);
  const [runs, setRuns] = useState<TaskRunRecord[]>([]);
  const [artifacts, setArtifacts] = useState<TaskArtifactRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalInitial, setModalInitial] = useState<TaskFormState | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  const refresh = useCallback(async (): Promise<void> => {
    const [nextTasks, nextRuns, nextArtifacts] = await Promise.all([
      api.listTasks(),
      api.listTaskRuns(),
      api.listTaskArtifacts(),
    ]);
    setTasks(nextTasks);
    setRuns(nextRuns);
    setArtifacts(nextArtifacts);
    setLoading(false);
  }, [api]);

  useEffect(() => {
    void refresh();
    return api.onTasksState((state: TasksState) => {
      setTasks(state.tasks);
      setRuns(state.runs);
      setArtifacts(state.artifacts);
      setLoading(false);
    });
  }, [api, refresh]);

  const byId = useMemo(() => new Map(tasks.map((task) => [task.id, task])), [tasks]);
  const rows = useMemo<TaskRow[]>(
    () => toTaskRows(tasks, { schedule: t.scheduleSummary, none: t.none }),
    [tasks, t.scheduleSummary, t.none],
  );

  const runNow = (id: string): void => {
    void api.runTaskNow({ id, action: 'run', idempotencyKey: crypto.randomUUID() });
  };
  const toggleEnabled = (task: TaskDefinition): void => {
    void api.setTaskEnabled({ id: task.id, enabled: task.status !== 'enabled' });
  };
  const del = (id: string): void => {
    if (window.confirm(t.deleteConfirm)) {
      void api.deleteTask(id).then(() => {
        if (selectedTaskId === id) setSelectedTaskId(null);
      });
    }
  };

  const openFromConversation = (detail: AgentConversationDetail): void => {
    setPickerOpen(false);
    const firstPrompt = detail.turns[0]?.prompt ?? '';
    const existing = tasks.find((task) => task.sourceConversationId === detail.summary.id);
    setModalInitial(
      formStateFromConversation({
        conversationId: detail.summary.id,
        firstPrompt,
        ...(existing?.targetUrl !== undefined ? { targetUrl: existing.targetUrl } : {}),
        ...(existing !== undefined ? { existingTaskId: existing.id } : {}),
      }),
    );
  };

  const columns = useMemo<TableColumn<TaskRow>[]>(
    () => [
      {
        key: 'name',
        header: t.columns.name,
        sortable: true,
        thClass: 'w-64',
        tdClass: 'w-64 max-w-64',
        render: (row) => (
          <button
            type="button"
            onClick={() => setSelectedTaskId((prev) => (prev === row.id ? null : row.id))}
            className="block w-full truncate text-left font-medium text-text-primary hover:underline focus-visible:outline-none"
            title={row.name}
          >
            {row.name}
            {row.sourceConversationId !== undefined && (
              <Badge variant="info" className="ml-2 align-middle">
                {t.sourceChat}
              </Badge>
            )}
          </button>
        ),
      },
      {
        key: 'scheduleText',
        header: t.columns.schedule,
        sortable: true,
        render: (row) => <span className="text-sm text-text-secondary">{row.scheduleText}</span>,
      },
      {
        key: 'status',
        header: t.columns.status,
        sortable: true,
        thClass: 'w-28',
        tdClass: 'w-28',
        render: (row) => <Badge variant={row.statusVariant}>{t.status[row.status]}</Badge>,
      },
      {
        key: 'lastRunText',
        header: t.columns.lastRun,
        thClass: 'w-40',
        tdClass: 'w-40',
        render: (row) => <span className="text-xs text-text-secondary">{row.lastRunText}</span>,
      },
      {
        key: 'nextRunText',
        header: t.columns.nextRun,
        thClass: 'w-40',
        tdClass: 'w-40',
        render: (row) => <span className="text-xs text-text-secondary">{row.nextRunText}</span>,
      },
      {
        key: 'actions',
        header: t.columns.actions,
        align: 'right',
        thClass: 'w-72',
        tdClass: 'w-72',
        render: (row) => {
          const task = byId.get(row.id);
          if (task === undefined) return null;
          return (
            <div className="flex justify-end gap-1">
              <Button size="xs" variant="outline" onClick={() => runNow(task.id)}>
                {t.actions.runNow}
              </Button>
              <Button size="xs" variant="outline" onClick={() => toggleEnabled(task)}>
                {task.status === 'enabled' ? t.actions.disable : t.actions.enable}
              </Button>
              {task.sourceConversationId !== undefined && (
                <Button size="xs" variant="ghost" onClick={() => api.createTab(AGENT_PAGE_URL)}>
                  {t.actions.viewChat}
                </Button>
              )}
              <Button size="xs" variant="ghost" onClick={() => setModalInitial(formStateFromTask(task))}>
                {t.actions.edit}
              </Button>
              <Button size="xs" variant="danger" onClick={() => del(task.id)}>
                {t.actions.delete}
              </Button>
            </div>
          );
        },
      },
    ],
    [t, byId],
  );

  const visibleRuns = useMemo(
    () => (selectedTaskId === null ? runs : runs.filter((run) => run.taskId === selectedTaskId)).slice(0, 12),
    [runs, selectedTaskId],
  );
  const visibleArtifacts = useMemo(
    () =>
      (selectedTaskId === null
        ? artifacts
        : artifacts.filter((artifact) => artifact.taskId === selectedTaskId)
      ).slice(0, 12),
    [artifacts, selectedTaskId],
  );
  const selectedName = selectedTaskId !== null ? byId.get(selectedTaskId)?.name : undefined;

  return (
    <div className="h-full overflow-auto bg-surface-system px-8 py-6 text-text-primary">
      <div className="mx-auto max-w-5xl space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">{t.title}</h1>
            <p className="mt-1 text-sm text-text-secondary">{t.subtitle}</p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setPickerOpen(true)}>
              {t.newFromConversation}
            </Button>
            <Button size="sm" onClick={() => setModalInitial(blankFormState())}>
              {t.newTask}
            </Button>
          </div>
        </div>

        {loading ? (
          <p className="text-sm text-text-secondary">{t.loading}</p>
        ) : tasks.length === 0 ? (
          <Card>
            <p className="text-sm font-medium text-text-primary">{t.empty}</p>
            <p className="mt-1 text-sm text-text-secondary">{t.emptyHint}</p>
          </Card>
        ) : (
          <DataTable
            caption={t.title}
            rows={rows}
            columns={columns}
            searchable
            searchPlaceholder={t.searchPlaceholder}
            pageSize={10}
            emptyMessage={t.noResults}
          />
        )}

        <div className="grid gap-4 md:grid-cols-2">
          <Card
            title={t.runs.title}
            subtitle={selectedName !== undefined ? selectedName : t.runs.allTasks}
            headerRight={
              selectedTaskId !== null ? (
                <Button size="xs" variant="ghost" onClick={() => setSelectedTaskId(null)}>
                  {t.runs.clearFilter}
                </Button>
              ) : undefined
            }
          >
            {visibleRuns.length === 0 ? (
              <p className="text-sm text-text-secondary">{t.runs.empty}</p>
            ) : (
              <ul className="space-y-2">
                {visibleRuns.map((run) => (
                  <li key={run.id} className="flex items-center gap-2 text-xs">
                    <Badge variant={runStatusVariant(run.status)}>{t.runStatus[run.status]}</Badge>
                    <span className="min-w-0 flex-1 truncate text-text-primary">
                      {byId.get(run.taskId)?.name ?? run.taskId}
                    </span>
                    <span className="shrink-0 text-text-secondary">
                      {fmtTime(run.startedAt ?? run.queuedAt, t.none)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title={t.artifacts.title}>
            {visibleArtifacts.length === 0 ? (
              <p className="text-sm text-text-secondary">{t.artifacts.empty}</p>
            ) : (
              <ul className="space-y-2">
                {visibleArtifacts.map((artifact) => (
                  <li key={artifact.id} className="flex items-center gap-2 text-xs">
                    <span className="min-w-0 flex-1 truncate text-text-primary">{artifact.title}</span>
                    <span className="shrink-0 text-text-secondary">{artifact.kind}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>

      <TaskModal
        api={api}
        initial={modalInitial}
        onClose={() => setModalInitial(null)}
        onSaved={() => void refresh()}
      />
      <ConversationPicker
        api={api}
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onPick={openFromConversation}
      />
    </div>
  );
}
