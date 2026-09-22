import { describe, expect, it } from 'vitest';
import type { TaskDefinition } from '@tepegoz/tasks';
import {
  TASKS_EXPORT_FORMAT,
  TASKS_EXPORT_VERSION,
  parseTasksImport,
  serializeTasksJson,
} from './task-export';

const task = (id: string, name: string, over: Partial<TaskDefinition> = {}): TaskDefinition => ({
  id,
  name,
  prompt: 'Check the price and tell me if it drops',
  status: 'enabled',
  triggers: [{ type: 'manual' }, { type: 'interval', enabled: true, everyMinutes: 30 }],
  policy: {
    allowedOrigins: ['https://shop.example'],
    allowedReadTools: ['browser.read'],
    preapprovedWriteTools: ['browser.click', 'browser.fill'],
    maxRunDurationMs: 600_000,
    cooldownMs: 900_000,
    notifyOnStart: true,
    notifyOnDone: true,
    notifyOnError: true,
  },
  targetUrl: 'https://shop.example/item/1',
  targetOrigin: 'https://shop.example',
  sourceConversationId: 'conv-1',
  createdAt: 1_000,
  updatedAt: 2_000,
  lastRunAt: 1_500,
  nextRunAt: 3_000,
  ...over,
});

describe('serializeTasksJson', () => {
  it('wraps the tasks in a versioned, format-marked envelope and ends with a newline', () => {
    const out = serializeTasksJson([task('t1', 'Watch price')]);
    expect(out.endsWith('\n')).toBe(true);
    const parsed = JSON.parse(out) as { format: string; version: number; tasks: unknown[] };
    expect(parsed.format).toBe(TASKS_EXPORT_FORMAT);
    expect(parsed.version).toBe(TASKS_EXPORT_VERSION);
    expect(parsed.tasks).toHaveLength(1);
  });

  it('writes an empty task list rather than omitting the key', () => {
    expect(JSON.parse(serializeTasksJson([]))).toMatchObject({ tasks: [] });
  });

  it('exports only the reusable definition — never policy, run state, or sourceConversationId', () => {
    const out = JSON.parse(serializeTasksJson([task('t1', 'Watch price')])) as {
      tasks: Record<string, unknown>[];
    };
    const entry = out.tasks[0]!;
    expect(entry).toEqual({
      id: 't1',
      name: 'Watch price',
      prompt: 'Check the price and tell me if it drops',
      status: 'enabled',
      triggers: [{ type: 'manual' }, { type: 'interval', enabled: true, everyMinutes: 30 }],
      targetUrl: 'https://shop.example/item/1',
      targetOrigin: 'https://shop.example',
    });
    expect(entry.policy).toBeUndefined();
    expect(entry.autonomy).toBeUndefined();
    expect(entry.sourceConversationId).toBeUndefined();
    expect(entry.createdAt).toBeUndefined();
    expect(entry.updatedAt).toBeUndefined();
    expect(entry.lastRunAt).toBeUndefined();
    expect(entry.nextRunAt).toBeUndefined();
  });
});

describe('parseTasksImport', () => {
  it('round-trips what serializeTasksJson wrote', () => {
    const json = serializeTasksJson([task('t1', 'A'), task('t2', 'B')]);
    const { tasks, skipped } = parseTasksImport(json);
    expect(tasks.map((t) => t.id)).toEqual(['t1', 't2']);
    expect(skipped).toBe(0);
  });

  it('also accepts a bare JSON array of task entries', () => {
    const entry = {
      id: 't1',
      name: 'A',
      prompt: 'do it',
      triggers: [{ type: 'manual' }],
    };
    const { tasks, skipped } = parseTasksImport(JSON.stringify([entry]));
    expect(tasks).toHaveLength(1);
    expect(skipped).toBe(0);
  });

  it('skips an entry the task schema rejects (missing prompt), keeping the rest', () => {
    const good = { id: 't1', name: 'A', prompt: 'do it', triggers: [{ type: 'manual' }] };
    const bad = { id: 'bad', name: '', triggers: [] };
    const json = JSON.stringify({
      format: TASKS_EXPORT_FORMAT,
      version: 1,
      tasks: [good, bad, { ...good, id: 't2' }],
    });
    const { tasks, skipped } = parseTasksImport(json);
    expect(tasks.map((t) => t.id)).toEqual(['t1', 't2']);
    expect(skipped).toBe(1);
  });

  it('throws a SyntaxError on text that is not JSON', () => {
    expect(() => parseTasksImport('not json {')).toThrow(SyntaxError);
  });

  it('throws a SyntaxError on JSON with no task list (object, number, null)', () => {
    expect(() => parseTasksImport('{"format":"tepegoz.tasks"}')).toThrow(SyntaxError);
    expect(() => parseTasksImport('42')).toThrow(SyntaxError);
    expect(() => parseTasksImport('null')).toThrow(SyntaxError);
  });

  it('returns an all-skipped result (not a throw) for a list of only bad entries', () => {
    const { tasks, skipped } = parseTasksImport(JSON.stringify([{ nope: 1 }, { nope: 2 }]));
    expect(tasks).toEqual([]);
    expect(skipped).toBe(2);
  });

  it('strips a smuggled policy/autonomy from an entry instead of honoring it (never grants capability an import file merely claims)', () => {
    const entry = {
      id: 't1',
      name: 'A',
      prompt: 'do it',
      triggers: [{ type: 'manual' }],
      autonomy: 'sameOriginWrites',
      policy: {
        allowedOrigins: ['https://evil.example'],
        allowedReadTools: [],
        preapprovedWriteTools: ['browser.click', 'browser.submit_form'],
        maxRunDurationMs: 600_000,
        cooldownMs: 0,
        notifyOnStart: false,
        notifyOnDone: false,
        notifyOnError: false,
      },
    };
    const { tasks, skipped } = parseTasksImport(JSON.stringify([entry]));
    expect(skipped).toBe(0);
    expect(tasks).toHaveLength(1);
    const parsed = tasks[0] as Record<string, unknown>;
    expect(parsed.policy).toBeUndefined();
    expect(parsed.autonomy).toBeUndefined();
  });

  it('still accepts a hand-edited entry that carries a sourceConversationId (schema-permissive; only serializeTasksJson never writes one)', () => {
    // sourceConversationId IS still part of TaskSaveInputSchema (optional), so a hand-edited file that
    // includes it is not rejected — only serializeTasksJson never writes it. This is a deliberate,
    // narrower guarantee than the policy/autonomy stripping above: see the module doc in task-export.ts.
    const entry = {
      id: 't1',
      name: 'A',
      prompt: 'do it',
      triggers: [{ type: 'manual' }],
      sourceConversationId: 'conv-from-other-machine',
    };
    const { tasks, skipped } = parseTasksImport(JSON.stringify([entry]));
    expect(skipped).toBe(0);
    expect(tasks[0]?.sourceConversationId).toBe('conv-from-other-machine');
  });
});
