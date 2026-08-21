import { describe, expect, it } from 'vitest';
import { defaultTaskPolicy, type TaskDefinition } from '@tepegoz/tasks';
import {
  blankFormState,
  buildSaveInput,
  formStateFromConversation,
  formStateFromTask,
  inferAutonomy,
  inferSchedule,
  runStatusVariant,
  statusVariant,
  toTaskRows,
  triggerSummary,
} from './tasks-page-model';

const LABELS = {
  schedule: { everyMinutes: 'Every {n} min', pageChange: 'On change', manual: 'Manual only' },
  none: '—',
};

function task(overrides: Partial<TaskDefinition> = {}): TaskDefinition {
  return {
    id: 't1',
    name: 'Watch price',
    prompt: 'Check the price',
    status: 'enabled',
    triggers: [{ type: 'manual' }, { type: 'interval', enabled: true, everyMinutes: 15 }],
    policy: defaultTaskPolicy(),
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

describe('badge variants', () => {
  it('maps task + run statuses', () => {
    expect(statusVariant('enabled')).toBe('success');
    expect(statusVariant('disabled')).toBe('neutral');
    expect(statusVariant('archived')).toBe('warning');
    expect(runStatusVariant('succeeded')).toBe('success');
    expect(runStatusVariant('failed')).toBe('error');
    expect(runStatusVariant('running')).toBe('info');
    expect(runStatusVariant('awaiting_approval')).toBe('warning');
    expect(runStatusVariant('queued')).toBe('neutral');
  });
});

describe('triggerSummary', () => {
  it('summarizes interval, pageChange, and manual-only', () => {
    expect(
      triggerSummary([{ type: 'interval', enabled: true, everyMinutes: 15 }], LABELS.schedule),
    ).toBe('Every 15 min');
    expect(
      triggerSummary(
        [
          {
            type: 'pageChange',
            enabled: true,
            url: 'https://shop.example.com/x',
            everyMinutes: 10,
            changeMode: 'textHash',
            fireOnFirstCheck: false,
          },
        ],
        LABELS.schedule,
      ),
    ).toBe('On change · shop.example.com');
    expect(triggerSummary([{ type: 'manual' }], LABELS.schedule)).toBe('Manual only');
  });
});

describe('toTaskRows', () => {
  it('projects tasks to rows with placeholders for missing timestamps', () => {
    const rows = toTaskRows([task({ lastRunAt: undefined, nextRunAt: 1000 })], LABELS);
    expect(rows[0]).toMatchObject({
      id: 't1',
      name: 'Watch price',
      scheduleText: 'Every 15 min',
      status: 'enabled',
      statusVariant: 'success',
      lastRunText: '—',
    });
    expect(rows[0]?.nextRunText).not.toBe('—');
  });
});

describe('inferSchedule + inferAutonomy', () => {
  it('recovers continuous vs interval vs pageChange', () => {
    expect(inferSchedule([{ type: 'interval', enabled: true, everyMinutes: 5 }]).preset).toBe(
      'continuous',
    );
    expect(inferSchedule([{ type: 'interval', enabled: true, everyMinutes: 30 }])).toMatchObject({
      preset: 'interval',
      everyMinutes: 30,
    });
    expect(
      inferSchedule([
        {
          type: 'pageChange',
          enabled: true,
          url: 'https://x.com',
          everyMinutes: 10,
          changeMode: 'elementText',
          fireOnFirstCheck: false,
          selector: '.p',
        },
      ]),
    ).toMatchObject({ preset: 'pageChange', selector: '.p', changeMode: 'elementText' });
  });

  it('infers autonomy from the stored policy', () => {
    expect(inferAutonomy(defaultTaskPolicy())).toBe('notify');
    expect(
      inferAutonomy({
        ...defaultTaskPolicy(),
        allowedOrigins: ['https://x.com'],
        preapprovedWriteTools: ['browser_click'],
      }),
    ).toBe('sameOriginWrites');
  });
});

describe('form state round-trips', () => {
  it('formStateFromTask round-trips through buildSaveInput', () => {
    const original = task({
      id: 't9',
      targetUrl: 'https://example.com/watch',
      policy: {
        ...defaultTaskPolicy(),
        allowedOrigins: ['https://example.com'],
        preapprovedWriteTools: ['browser_click'],
      },
    });
    const form = formStateFromTask(original);
    expect(form).toMatchObject({
      id: 't9',
      preset: 'interval',
      everyMinutes: 15,
      autonomy: 'sameOriginWrites',
    });
    const result = buildSaveInput(form);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.input.id).toBe('t9');
      expect(result.input.autonomy).toBe('sameOriginWrites');
      expect(result.input.triggers).toEqual([
        { type: 'manual' },
        { type: 'interval', enabled: true, everyMinutes: 15 },
      ]);
    }
  });

  it('seeds from a conversation with sameOriginWrites default', () => {
    const form = formStateFromConversation({ conversationId: 'c1', firstPrompt: 'Do the thing' });
    expect(form).toMatchObject({
      sourceConversationId: 'c1',
      autonomy: 'sameOriginWrites',
      prompt: 'Do the thing',
    });
    expect(form.name.length).toBeGreaterThan(0);
  });

  it('validates required fields and URLs', () => {
    expect(buildSaveInput({ ...blankFormState(), name: '' }).ok).toBe(false);
    expect(buildSaveInput({ ...blankFormState(), name: 'x', prompt: '' }).ok).toBe(false);
    const bad = buildSaveInput({
      ...blankFormState(),
      name: 'x',
      prompt: 'y',
      targetUrl: 'ftp://nope',
    });
    expect(bad).toEqual({ ok: false, error: 'url' });
    expect(
      buildSaveInput({ ...blankFormState(), name: 'x', prompt: 'y', targetUrl: 'https://ok.com' })
        .ok,
    ).toBe(true);
  });
});
