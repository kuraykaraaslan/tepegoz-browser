import { beforeEach, describe, expect, it } from 'vitest';
import {
  ModelGateway,
  type CanonRequest,
  type CanonResponse,
  type ModelProvider,
} from '@tepegoz/model-gateway';
import { CapabilityRegistry, ToolGateway, type RegisteredTool } from '@tepegoz/capability-plane';
import type { AIProvider, RiskLevel, ToolDescriptor } from '@tepegoz/shared-types';
import Reactor from './reactor';
import {
  ACCEPTANCE_SCENARIOS,
  recordFromOutcomes,
  summarizeAcceptanceRuns,
  type AcceptanceRunRecord,
  type AcceptanceScenarioId,
} from './acceptance-eval';

class ScriptedProvider implements ModelProvider {
  readonly id: AIProvider = 'anthropic';
  inputTokens = 0;
  outputTokens = 0;
  private turn = 0;
  constructor(private readonly replies: string[]) {}
  complete(req: CanonRequest, signal: AbortSignal): Promise<CanonResponse> {
    if (signal.aborted) throw new Error('aborted');
    const text = this.replies[this.turn] ?? finish('done');
    this.turn += 1;
    const inputTokens = req.messages.reduce((n, m) => n + m.content.length, 0);
    this.inputTokens += inputTokens;
    this.outputTokens += text.length;
    return Promise.resolve({
      text,
      stopReason: 'end',
      usage: { inputTokens, outputTokens: text.length },
      toolCalls: [],
    });
  }
}

const act = (tool: string, args: Record<string, unknown> = {}): string =>
  JSON.stringify({ action: 'act', tool, args, rationale: 'acceptance' });
const finish = (summary: string): string => JSON.stringify({ action: 'finish', summary });
const calls: Array<{ id: string; args: unknown }> = [];
const approvalLatencyMs: number[] = [];

function resetHarness(): void {
  calls.length = 0;
  approvalLatencyMs.length = 0;
  CapabilityRegistry.reset();
  ToolGateway.reset();
  ModelGateway.reset();
}

function registerTool(id: string, dangerClass: RiskLevel, results: unknown[]): void {
  let index = 0;
  const descriptor: ToolDescriptor = {
    id,
    description: `acceptance ${id}`,
    dangerClass,
    source: 'builtin',
    inputSchema: { type: 'object' },
    requiresIdempotencyKey: false,
  };
  const tool: RegisteredTool<unknown> = {
    descriptor,
    inputSchema: { safeParse: (data: unknown) => ({ success: true, data }) },
    handler: (args) => {
      calls.push({ id, args });
      const result = results[Math.min(index, results.length - 1)];
      index += 1;
      return result;
    },
  };
  CapabilityRegistry.register(tool);
}

function toolIds() {
  return CapabilityRegistry.list().map((d) => ({
    id: d.id,
    description: d.description,
    dangerClass: d.dangerClass,
  }));
}

async function runAcceptance(input: {
  id: AcceptanceScenarioId;
  replies: string[];
  recovered?: boolean;
  ok?: boolean;
  guard?: (text: string) => boolean;
}): Promise<AcceptanceRunRecord> {
  const provider = new ScriptedProvider(input.replies);
  ModelGateway.register(provider);
  ToolGateway.setConfirmHandler(() => {
    approvalLatencyMs.push(0);
    return Promise.resolve(true);
  });
  const result = await Reactor.run(
    { goal: input.id, tools: toolIds(), provider: 'anthropic', model: 'mock' },
    {
      guard: (outcome) => {
        if (!outcome.ok || input.guard === undefined) return null;
        return input.guard(JSON.stringify(outcome.result)) ? 'handoff' : null;
      },
    },
  );
  return recordFromOutcomes({
    scenarioId: input.id,
    stoppedReason: result.stoppedReason,
    outcomes: result.outcomes,
    approvalLatencyMs: [...approvalLatencyMs],
    tokenUsage: { inputTokens: provider.inputTokens, outputTokens: provider.outputTokens },
    recovered: input.recovered,
    ok: input.ok,
  });
}

beforeEach(resetHarness);

describe('Phase 5 acceptance eval scenarios', () => {
  it('covers every planned acceptance scenario id', () => {
    expect(ACCEPTANCE_SCENARIOS.map((s) => s.id)).toEqual([
      'headings_summary',
      'multi_tab_research',
      'form_fill_stop_before_submit',
      'action_recovery',
      'human_handoff',
    ]);
  });

  it('passes the Claude-level acceptance suite and computes metrics', async () => {
    const records: AcceptanceRunRecord[] = [];

    registerTool('browser_get_page', 'read', [{ content: '# Intro\n## Details\n## Risks' }]);
    records.push(await runAcceptance({
      id: 'headings_summary',
      replies: [act('browser_get_page'), finish('Intro, Details, and Risks summarized.')],
    }));
    expect(calls.map((c) => c.id)).toEqual(['browser_get_page']);

    resetHarness();
    registerTool('browser_get_page', 'read', [
      { content: 'Source A: price low, quality high' },
      { content: 'Source B: price medium, quality high' },
      { content: 'Source C: price high, quality high' },
    ]);
    registerTool('tab_create_item', 'read', [{ id: 'tab-b' }, { id: 'tab-c' }]);
    records.push(await runAcceptance({
      id: 'multi_tab_research',
      replies: [
        act('browser_get_page'),
        act('tab_create_item', { url: 'https://b.example' }),
        act('browser_get_page', { tabId: 'tab-b' }),
        act('tab_create_item', { url: 'https://c.example' }),
        act('browser_get_page', { tabId: 'tab-c' }),
        finish('| Source | Price | Quality |'),
      ],
    }));
    expect(calls.filter((c) => c.id === 'browser_get_page')).toHaveLength(3);

    resetHarness();
    registerTool('browser_get_elements', 'read', [{ content: 'name, email, Submit button' }]);
    registerTool('browser_update_page', 'state_changing', [{ ok: true, changed: true }]);
    records.push(await runAcceptance({
      id: 'form_fill_stop_before_submit',
      replies: [
        act('browser_get_elements'),
        act('browser_update_page', { action: 'fill', ref: 1, text: 'Ada' }),
        act('browser_update_page', { action: 'fill', ref: 2, text: 'ada@example.com' }),
        finish('Form filled; stopped before submit.'),
      ],
    }));
    expect(calls.some((c) => JSON.stringify(c.args).includes('submit'))).toBe(false);

    resetHarness();
    registerTool('browser_get_elements', 'read', [{ content: '1 Continue, 2 Confirm' }]);
    registerTool('browser_update_page', 'state_changing', [
      { ok: true, changed: false, recoveryHint: 'try a different ref' },
      { ok: true, changed: true },
    ]);
    registerTool('browser_validate_page', 'read', [{ ok: true, changed: false }, { ok: true, changed: true }]);
    records.push(await runAcceptance({
      id: 'action_recovery',
      recovered: true,
      replies: [
        act('browser_get_elements'),
        act('browser_update_page', { action: 'click', ref: 1 }),
        act('browser_validate_page', { expectedText: 'Done' }),
        act('browser_get_elements'),
        act('browser_update_page', { action: 'click', ref: 2 }),
        act('browser_validate_page', { expectedText: 'Done' }),
        finish('Recovered and completed.'),
      ],
    }));

    resetHarness();
    registerTool('browser_get_page', 'read', [{ content: 'Please complete the CAPTCHA to continue.' }]);
    records.push(await runAcceptance({
      id: 'human_handoff',
      ok: true,
      replies: [act('browser_get_page'), act('browser_update_page', { action: 'solve_captcha' })],
      guard: (text) => text.toLowerCase().includes('captcha'),
    }));
    expect(records.at(-1)?.stoppedReason).toBe('handoff');

    const metrics = summarizeAcceptanceRuns(records);
    expect(metrics).toMatchObject({
      total: 5,
      passed: 5,
      taskSuccessRate: 1,
      recoverySuccessRate: 1,
      toolErrorRate: 0,
      navigationValidationFailureRate: 0.5,
    });
    expect(metrics.tokenUsage.totalTokens).toBeGreaterThan(0);
  });

  it('counts a registry scenario (string id) as a recovery run via its own requiresRecovery flag', () => {
    // AI-1: registry ids are open strings and carry their own recovery expectation (no static lookup).
    const rec = recordFromOutcomes({
      scenarioId: 'ai1_custom_recovery',
      stoppedReason: 'completed',
      outcomes: [],
      requiresRecovery: true,
      recovered: true,
    });
    expect(rec.scenarioId).toBe('ai1_custom_recovery');
    expect(rec.requiresRecovery).toBe(true);
    expect(summarizeAcceptanceRuns([rec]).recoverySuccessRate).toBe(1);

    // Same scenario that did NOT recover → the recovery rate reflects the failure.
    const failed = recordFromOutcomes({
      scenarioId: 'ai1_custom_recovery',
      stoppedReason: 'max_steps',
      outcomes: [],
      requiresRecovery: true,
      recovered: false,
      ok: false,
    });
    expect(summarizeAcceptanceRuns([failed]).recoverySuccessRate).toBe(0);
  });
});
