import type {
  TaskArtifactRecord,
  TaskDefinition,
  TaskPolicy,
  TaskRunRecord,
  TaskTrigger,
} from '@tepegoz/tasks';
import type { Db } from './db';

interface TaskRow {
  id: string;
  name: string;
  prompt: string;
  description: string | null;
  status: TaskDefinition['status'];
  triggers: string;
  policy: string;
  target_url: string | null;
  target_origin: string | null;
  source_conversation_id: string | null;
  created_at: number;
  updated_at: number;
  last_run_at: number | null;
  next_run_at: number | null;
}

interface TaskRunRow {
  id: string;
  task_id: string;
  correlation_id: string;
  trigger_type: TaskRunRecord['triggerType'];
  trigger_source: string | null;
  status: TaskRunRecord['status'];
  queued_at: number;
  started_at: number | null;
  completed_at: number | null;
  summary: string | null;
  error: string | null;
}

interface TaskArtifactRow {
  id: string;
  task_id: string;
  run_id: string;
  kind: TaskArtifactRecord['kind'];
  title: string;
  summary: string | null;
  mime_type: string | null;
  blob_ref: string | null;
  path: string | null;
  url: string | null;
  created_at: number;
}

export interface TaskTriggerStateRecord {
  taskId: string;
  triggerKey: string;
  lastCheckedAt?: number | undefined;
  lastFiredAt?: number | undefined;
  nextCheckAt?: number | undefined;
  baselineHash?: string | undefined;
  baselinePreview?: string | undefined;
  error?: string | undefined;
}

interface TaskTriggerStateRow {
  task_id: string;
  trigger_key: string;
  last_checked_at: number | null;
  last_fired_at: number | null;
  next_check_at: number | null;
  baseline_hash: string | null;
  baseline_preview: string | null;
  error: string | null;
}

function parseJson<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function rowToTask(row: TaskRow): TaskDefinition {
  return {
    id: row.id,
    name: row.name,
    prompt: row.prompt,
    ...(row.description !== null ? { description: row.description } : {}),
    status: row.status,
    triggers: parseJson<TaskTrigger[]>(row.triggers, []),
    policy: parseJson<TaskPolicy>(row.policy, {
      allowedOrigins: [],
      allowedReadTools: [],
      preapprovedWriteTools: [],
      maxRunDurationMs: 600_000,
      cooldownMs: 900_000,
      notifyOnStart: true,
      notifyOnDone: true,
      notifyOnError: true,
    }),
    ...(row.target_url !== null ? { targetUrl: row.target_url } : {}),
    ...(row.target_origin !== null ? { targetOrigin: row.target_origin } : {}),
    ...(row.source_conversation_id !== null
      ? { sourceConversationId: row.source_conversation_id }
      : {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(row.last_run_at !== null ? { lastRunAt: row.last_run_at } : {}),
    ...(row.next_run_at !== null ? { nextRunAt: row.next_run_at } : {}),
  };
}

function taskParams(task: TaskDefinition): Record<string, unknown> {
  return {
    id: task.id,
    name: task.name,
    prompt: task.prompt,
    description: task.description ?? null,
    status: task.status,
    triggers: JSON.stringify(task.triggers),
    policy: JSON.stringify(task.policy),
    targetUrl: task.targetUrl ?? null,
    targetOrigin: task.targetOrigin ?? null,
    sourceConversationId: task.sourceConversationId ?? null,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    lastRunAt: task.lastRunAt ?? null,
    nextRunAt: task.nextRunAt ?? null,
  };
}

function rowToRun(row: TaskRunRow): TaskRunRecord {
  return {
    id: row.id,
    taskId: row.task_id,
    correlationId: row.correlation_id,
    triggerType: row.trigger_type,
    ...(row.trigger_source !== null ? { triggerSource: row.trigger_source } : {}),
    status: row.status,
    queuedAt: row.queued_at,
    ...(row.started_at !== null ? { startedAt: row.started_at } : {}),
    ...(row.completed_at !== null ? { completedAt: row.completed_at } : {}),
    ...(row.summary !== null ? { summary: row.summary } : {}),
    ...(row.error !== null ? { error: row.error } : {}),
  };
}

function runParams(run: TaskRunRecord): Record<string, unknown> {
  return {
    id: run.id,
    taskId: run.taskId,
    correlationId: run.correlationId,
    triggerType: run.triggerType,
    triggerSource: run.triggerSource ?? null,
    status: run.status,
    queuedAt: run.queuedAt,
    startedAt: run.startedAt ?? null,
    completedAt: run.completedAt ?? null,
    summary: run.summary ?? null,
    error: run.error ?? null,
  };
}

function rowToArtifact(row: TaskArtifactRow): TaskArtifactRecord {
  return {
    id: row.id,
    taskId: row.task_id,
    runId: row.run_id,
    kind: row.kind,
    title: row.title,
    ...(row.summary !== null ? { summary: row.summary } : {}),
    ...(row.mime_type !== null ? { mimeType: row.mime_type } : {}),
    ...(row.blob_ref !== null ? { blobRef: row.blob_ref } : {}),
    ...(row.path !== null ? { path: row.path } : {}),
    ...(row.url !== null ? { url: row.url } : {}),
    createdAt: row.created_at,
  };
}

function artifactParams(artifact: TaskArtifactRecord): Record<string, unknown> {
  return {
    id: artifact.id,
    taskId: artifact.taskId,
    runId: artifact.runId,
    kind: artifact.kind,
    title: artifact.title,
    summary: artifact.summary ?? null,
    mimeType: artifact.mimeType ?? null,
    blobRef: artifact.blobRef ?? null,
    path: artifact.path ?? null,
    url: artifact.url ?? null,
    createdAt: artifact.createdAt,
  };
}

function rowToTriggerState(row: TaskTriggerStateRow): TaskTriggerStateRecord {
  return {
    taskId: row.task_id,
    triggerKey: row.trigger_key,
    ...(row.last_checked_at !== null ? { lastCheckedAt: row.last_checked_at } : {}),
    ...(row.last_fired_at !== null ? { lastFiredAt: row.last_fired_at } : {}),
    ...(row.next_check_at !== null ? { nextCheckAt: row.next_check_at } : {}),
    ...(row.baseline_hash !== null ? { baselineHash: row.baseline_hash } : {}),
    ...(row.baseline_preview !== null ? { baselinePreview: row.baseline_preview } : {}),
    ...(row.error !== null ? { error: row.error } : {}),
  };
}

function triggerStateParams(state: TaskTriggerStateRecord): Record<string, unknown> {
  return {
    taskId: state.taskId,
    triggerKey: state.triggerKey,
    lastCheckedAt: state.lastCheckedAt ?? null,
    lastFiredAt: state.lastFiredAt ?? null,
    nextCheckAt: state.nextCheckAt ?? null,
    baselineHash: state.baselineHash ?? null,
    baselinePreview: state.baselinePreview ?? null,
    error: state.error ?? null,
  };
}

export class TaskStore {
  static list(db: Db, limit = 500): TaskDefinition[] {
    const n = Math.max(1, Math.min(Math.trunc(limit), 1000));
    const rows = db
      .prepare('SELECT * FROM tasks ORDER BY updated_at DESC LIMIT ?')
      .all(n) as TaskRow[];
    return rows.map(rowToTask);
  }

  static due(db: Db, now: number, limit = 100): TaskDefinition[] {
    const n = Math.max(1, Math.min(Math.trunc(limit), 500));
    const rows = db
      .prepare(
        "SELECT * FROM tasks WHERE status = 'enabled' AND next_run_at IS NOT NULL AND next_run_at <= ? ORDER BY next_run_at ASC LIMIT ?",
      )
      .all(now, n) as TaskRow[];
    return rows.map(rowToTask);
  }

  static get(db: Db, id: string): TaskDefinition | null {
    const row = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as TaskRow | undefined;
    return row === undefined ? null : rowToTask(row);
  }

  static upsert(db: Db, task: TaskDefinition): void {
    db.prepare(
      `INSERT INTO tasks (
        id, name, prompt, description, status, triggers, policy, target_url, target_origin,
        source_conversation_id, created_at, updated_at, last_run_at, next_run_at
      ) VALUES (
        @id, @name, @prompt, @description, @status, @triggers, @policy, @targetUrl,
        @targetOrigin, @sourceConversationId, @createdAt, @updatedAt, @lastRunAt, @nextRunAt
      )
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        prompt = excluded.prompt,
        description = excluded.description,
        status = excluded.status,
        triggers = excluded.triggers,
        policy = excluded.policy,
        target_url = excluded.target_url,
        target_origin = excluded.target_origin,
        source_conversation_id = excluded.source_conversation_id,
        updated_at = excluded.updated_at,
        last_run_at = excluded.last_run_at,
        next_run_at = excluded.next_run_at`,
    ).run(taskParams(task));
  }

  static delete(db: Db, id: string): void {
    db.prepare('DELETE FROM tasks WHERE id = ?').run(id);
  }

  static listRuns(db: Db, taskId?: string, limit = 500): TaskRunRecord[] {
    const n = Math.max(1, Math.min(Math.trunc(limit), 1000));
    const rows =
      taskId === undefined
        ? (db
            .prepare('SELECT * FROM task_runs ORDER BY queued_at DESC LIMIT ?')
            .all(n) as TaskRunRow[])
        : (db
            .prepare('SELECT * FROM task_runs WHERE task_id = ? ORDER BY queued_at DESC LIMIT ?')
            .all(taskId, n) as TaskRunRow[]);
    return rows.map(rowToRun);
  }

  static upsertRun(db: Db, run: TaskRunRecord): void {
    db.prepare(
      `INSERT INTO task_runs (
        id, task_id, correlation_id, trigger_type, trigger_source, status, queued_at, started_at,
        completed_at, summary, error
      ) VALUES (
        @id, @taskId, @correlationId, @triggerType, @triggerSource, @status, @queuedAt, @startedAt,
        @completedAt, @summary, @error
      )
      ON CONFLICT(id) DO UPDATE SET
        correlation_id = excluded.correlation_id,
        trigger_type = excluded.trigger_type,
        trigger_source = excluded.trigger_source,
        status = excluded.status,
        started_at = excluded.started_at,
        completed_at = excluded.completed_at,
        summary = excluded.summary,
        error = excluded.error`,
    ).run(runParams(run));
  }

  static listArtifacts(db: Db, taskId?: string, limit = 500): TaskArtifactRecord[] {
    const n = Math.max(1, Math.min(Math.trunc(limit), 1000));
    const rows =
      taskId === undefined
        ? (db
            .prepare('SELECT * FROM task_artifacts ORDER BY created_at DESC LIMIT ?')
            .all(n) as TaskArtifactRow[])
        : (db
            .prepare(
              'SELECT * FROM task_artifacts WHERE task_id = ? ORDER BY created_at DESC LIMIT ?',
            )
            .all(taskId, n) as TaskArtifactRow[]);
    return rows.map(rowToArtifact);
  }

  static addArtifact(db: Db, artifact: TaskArtifactRecord): void {
    db.prepare(
      `INSERT INTO task_artifacts (
        id, task_id, run_id, kind, title, summary, mime_type, blob_ref, path, url, created_at
      ) VALUES (
        @id, @taskId, @runId, @kind, @title, @summary, @mimeType, @blobRef, @path, @url, @createdAt
      )`,
    ).run(artifactParams(artifact));
  }

  static listTriggerState(db: Db, taskId?: string): TaskTriggerStateRecord[] {
    const rows =
      taskId === undefined
        ? (db
            .prepare('SELECT * FROM task_trigger_state ORDER BY next_check_at ASC')
            .all() as TaskTriggerStateRow[])
        : (db
            .prepare(
              'SELECT * FROM task_trigger_state WHERE task_id = ? ORDER BY next_check_at ASC',
            )
            .all(taskId) as TaskTriggerStateRow[]);
    return rows.map(rowToTriggerState);
  }

  static upsertTriggerState(db: Db, state: TaskTriggerStateRecord): void {
    db.prepare(
      `INSERT INTO task_trigger_state (
        task_id, trigger_key, last_checked_at, last_fired_at, next_check_at,
        baseline_hash, baseline_preview, error
      ) VALUES (
        @taskId, @triggerKey, @lastCheckedAt, @lastFiredAt, @nextCheckAt,
        @baselineHash, @baselinePreview, @error
      )
      ON CONFLICT(task_id, trigger_key) DO UPDATE SET
        last_checked_at = excluded.last_checked_at,
        last_fired_at = excluded.last_fired_at,
        next_check_at = excluded.next_check_at,
        baseline_hash = excluded.baseline_hash,
        baseline_preview = excluded.baseline_preview,
        error = excluded.error`,
    ).run(triggerStateParams(state));
  }
}
