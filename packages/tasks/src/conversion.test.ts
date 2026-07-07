import { describe, expect, it } from 'vitest';
import {
  buildTaskSaveInputFromConversation,
  deriveTaskName,
  originOf,
  presetToTrigger,
  primaryScheduleTrigger,
  synthesizePolicy,
} from './index';
import { TaskSaveInputSchema } from './schemas';

describe('conversion / presetToTrigger', () => {
  it('maps "continuous" to the engine floor (5 min interval)', () => {
    expect(presetToTrigger('continuous')).toEqual({ type: 'interval', enabled: true, everyMinutes: 5 });
  });

  it('clamps a custom interval below the minimum', () => {
    expect(presetToTrigger('interval', { everyMinutes: 2 })).toEqual({
      type: 'interval',
      enabled: true,
      everyMinutes: 5,
    });
    expect(presetToTrigger('interval', { everyMinutes: 30 })).toEqual({
      type: 'interval',
      enabled: true,
      everyMinutes: 30,
    });
  });

  it('builds a pageChange trigger with url + optional selector', () => {
    expect(
      presetToTrigger('pageChange', { url: 'https://example.com', everyMinutes: 10, selector: '.price' }),
    ).toEqual({
      type: 'pageChange',
      enabled: true,
      url: 'https://example.com',
      selector: '.price',
      everyMinutes: 10,
      changeMode: 'textHash',
      fireOnFirstCheck: false,
    });
    // Empty selector is dropped rather than stored as ''.
    expect(presetToTrigger('pageChange', { url: 'https://example.com', selector: '  ' })).not.toHaveProperty(
      'selector',
    );
  });
});

describe('conversion / synthesizePolicy', () => {
  it('notify keeps empty allowlists (pauses on every write)', () => {
    const policy = synthesizePolicy('notify', { targetOrigin: 'https://x.com', writeToolIds: ['browser_click'] });
    expect(policy.allowedOrigins).toEqual([]);
    expect(policy.preapprovedWriteTools).toEqual([]);
  });

  it('sameOriginWrites pre-approves the given tools on the target origin only', () => {
    const policy = synthesizePolicy('sameOriginWrites', {
      targetOrigin: 'https://shop.example.com',
      writeToolIds: ['browser_click', 'browser_type', 'browser_click'],
    });
    expect(policy.allowedOrigins).toEqual(['https://shop.example.com']);
    // De-duplicated.
    expect(policy.preapprovedWriteTools).toEqual(['browser_click', 'browser_type']);
  });

  it('sameOriginWrites without an origin approves nothing (fail-safe)', () => {
    const policy = synthesizePolicy('sameOriginWrites', { writeToolIds: ['browser_click'] });
    expect(policy.allowedOrigins).toEqual([]);
    expect(policy.preapprovedWriteTools).toEqual([]);
  });
});

describe('conversion / originOf + deriveTaskName', () => {
  it('extracts origins and tolerates junk', () => {
    expect(originOf('https://a.com/path?q=1')).toBe('https://a.com');
    expect(originOf('')).toBeUndefined();
    expect(originOf('not a url')).toBeUndefined();
  });

  it('derives a compact task name', () => {
    expect(deriveTaskName('  Check   the\nweather  ')).toBe('Check the weather');
    expect(deriveTaskName('')).toBe('Untitled task');
    expect(deriveTaskName('x'.repeat(200))).toHaveLength(80);
  });
});

describe('conversion / buildTaskSaveInputFromConversation', () => {
  const conversation = { id: 'conv-1', firstPrompt: 'Check BTC price and alert me if it moves' };

  it('produces a valid save input with a manual + interval trigger and no explicit policy', () => {
    const input = buildTaskSaveInputFromConversation({
      conversation,
      preset: 'interval',
      everyMinutes: 20,
      autonomy: 'sameOriginWrites',
      targetUrl: 'https://coinmarketcap.com/currencies/bitcoin/',
    });
    expect(input.name).toBe('Check BTC price and alert me if it moves');
    expect(input.prompt).toBe('Check BTC price and alert me if it moves');
    expect(input.autonomy).toBe('sameOriginWrites');
    expect(input.policy).toBeUndefined();
    expect(input.targetOrigin).toBe('https://coinmarketcap.com');
    expect(input.sourceConversationId).toBe('conv-1');
    expect(input.triggers).toEqual([
      { type: 'manual' },
      { type: 'interval', enabled: true, everyMinutes: 20 },
    ]);
    expect(TaskSaveInputSchema.safeParse(input).success).toBe(true);
  });

  it('uses the target URL as the pageChange url', () => {
    const input = buildTaskSaveInputFromConversation({
      conversation,
      preset: 'pageChange',
      autonomy: 'notify',
      targetUrl: 'https://example.com/deals',
      selector: '#deal',
    });
    expect(primaryScheduleTrigger(input.triggers)).toMatchObject({
      type: 'pageChange',
      url: 'https://example.com/deals',
      selector: '#deal',
    });
    expect(TaskSaveInputSchema.safeParse(input).success).toBe(true);
  });

  it('re-converting the same conversation updates in place via existingTaskId', () => {
    const input = buildTaskSaveInputFromConversation({
      conversation,
      preset: 'continuous',
      autonomy: 'notify',
      existingTaskId: 'task-42',
    });
    expect(input.id).toBe('task-42');
    expect(input.sourceConversationId).toBe('conv-1');
  });

  it('allows overriding the instruction and name', () => {
    const input = buildTaskSaveInputFromConversation({
      conversation,
      preset: 'continuous',
      autonomy: 'notify',
      prompt: 'Just tell me the price',
      name: 'BTC watcher',
    });
    expect(input.prompt).toBe('Just tell me the price');
    expect(input.name).toBe('BTC watcher');
  });
});
