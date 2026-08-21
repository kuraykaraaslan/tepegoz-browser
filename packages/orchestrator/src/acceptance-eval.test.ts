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
    inputSchema: {
      // Objects only. A validator that says yes to everything is refused at registration —
      // see CapabilityRegistry.register.
      safeParse: (data: unknown) =>
        typeof data === 'object' && data !== null
          ? { success: true as const, data }
          : { success: false as const, error: { issues: ['expected an object'] } },
    },
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
  const startedAt = Date.now();
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
    // M1: end-to-end wall-clock is REQUIRED on every record — measured here like the harness does.
    wallClockMs: Math.max(0, Date.now() - startedAt),
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
    records.push(
      await runAcceptance({
        id: 'headings_summary',
        replies: [act('browser_get_page'), finish('Intro, Details, and Risks summarized.')],
      }),
    );
    expect(calls.map((c) => c.id)).toEqual(['browser_get_page']);

    resetHarness();
    registerTool('browser_get_page', 'read', [
      { content: 'Source A: price low, quality high' },
      { content: 'Source B: price medium, quality high' },
      { content: 'Source C: price high, quality high' },
    ]);
    registerTool('tab_create_item', 'read', [{ id: 'tab-b' }, { id: 'tab-c' }]);
    records.push(
      await runAcceptance({
        id: 'multi_tab_research',
        replies: [
          act('browser_get_page'),
          act('tab_create_item', { url: 'https://b.example' }),
          act('browser_get_page', { tabId: 'tab-b' }),
          act('tab_create_item', { url: 'https://c.example' }),
          act('browser_get_page', { tabId: 'tab-c' }),
          finish('| Source | Price | Quality |'),
        ],
      }),
    );
    expect(calls.filter((c) => c.id === 'browser_get_page')).toHaveLength(3);

    resetHarness();
    registerTool('browser_get_elements', 'read', [{ content: 'name, email, Submit button' }]);
    registerTool('browser_update_page', 'state_changing', [{ ok: true, changed: true }]);
    records.push(
      await runAcceptance({
        id: 'form_fill_stop_before_submit',
        replies: [
          act('browser_get_elements'),
          act('browser_update_page', { action: 'fill', ref: 1, text: 'Ada' }),
          act('browser_update_page', { action: 'fill', ref: 2, text: 'ada@example.com' }),
          finish('Form filled; stopped before submit.'),
        ],
      }),
    );
    expect(calls.some((c) => JSON.stringify(c.args).includes('submit'))).toBe(false);

    resetHarness();
    registerTool('browser_get_elements', 'read', [{ content: '1 Continue, 2 Confirm' }]);
    registerTool('browser_update_page', 'state_changing', [
      { ok: true, changed: false, recoveryHint: 'try a different ref' },
      { ok: true, changed: true },
    ]);
    registerTool('browser_validate_page', 'read', [
      { ok: true, changed: false },
      { ok: true, changed: true },
    ]);
    records.push(
      await runAcceptance({
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
      }),
    );

    resetHarness();
    registerTool('browser_get_page', 'read', [
      { content: 'Please complete the CAPTCHA to continue.' },
    ]);
    records.push(
      await runAcceptance({
        id: 'human_handoff',
        ok: true,
        replies: [act('browser_get_page'), act('browser_update_page', { action: 'solve_captcha' })],
        guard: (text) => text.toLowerCase().includes('captcha'),
      }),
    );
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
      wallClockMs: 1000,
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
      wallClockMs: 1000,
      requiresRecovery: true,
      recovered: false,
      ok: false,
    });
    expect(summarizeAcceptanceRuns([failed]).recoverySuccessRate).toBe(0);
  });

  it('records the AI-7 escape flag and folds it into escapeRate (s31)', () => {
    const escaped = recordFromOutcomes({
      scenarioId: 'escape_bait',
      stoppedReason: 'completed',
      outcomes: [],
      wallClockMs: 1000,
      escaped: true,
    });
    const stayed = recordFromOutcomes({
      scenarioId: 'blog_behind_menu',
      stoppedReason: 'completed',
      outcomes: [],
      wallClockMs: 1000,
    });
    expect(escaped.escaped).toBe(true);
    expect(stayed.escaped).toBe(false); // defaults to "did not escape"
    expect(summarizeAcceptanceRuns([escaped, stayed]).escapeRate).toBe(0.5);
    expect(summarizeAcceptanceRuns([stayed]).escapeRate).toBe(0);
  });

  it('excludes escape-INELIGIBLE (off-site) runs from the escapeRate denominator', () => {
    const escaped = recordFromOutcomes({
      scenarioId: 'escape_bait',
      stoppedReason: 'completed',
      outcomes: [],
      wallClockMs: 1000,
      escaped: true,
    });
    const stayed = recordFromOutcomes({
      scenarioId: 'blog_behind_menu',
      stoppedReason: 'completed',
      outcomes: [],
      wallClockMs: 1000,
    });
    // A genuinely off-site (realUrl) run is not eligible → must not dilute the on-page escape rate.
    const offSite = recordFromOutcomes({
      scenarioId: 'open_web_task',
      stoppedReason: 'completed',
      outcomes: [],
      wallClockMs: 1000,
      escapeEligible: false,
    });
    expect(offSite.escapeEligible).toBe(false);
    // 1 escaped of 2 eligible = 50% — the off-site run is excluded, so it is NOT 1/3.
    expect(summarizeAcceptanceRuns([escaped, stayed, offSite]).escapeRate).toBe(0.5);
  });

  it('M1: carries end-to-end wall-clock per trial and aggregates a real per-trial median', () => {
    // A folded REPEAT=3 record: the sum is honest cost, the per-trial list feeds the percentile.
    const folded = recordFromOutcomes({
      scenarioId: 'form_validation_required',
      stoppedReason: 'completed',
      outcomes: [],
      wallClockMs: 6000,
      wallClocksMs: [1000, 2000, 3000],
    });
    expect(folded.wallClockMs).toBe(6000);
    expect(folded.wallClocksMs).toEqual([1000, 2000, 3000]);
    // A single-trial record defaults its per-trial list to [wallClockMs].
    const single = recordFromOutcomes({
      scenarioId: 'x',
      stoppedReason: 'completed',
      outcomes: [],
      wallClockMs: 500,
    });
    expect(single.wallClocksMs).toEqual([500]);
    // Median over ALL trials: [1000, 2000, 3000, 500] → (1000+2000)/2 = 1500.
    expect(summarizeAcceptanceRuns([folded, single]).runWallClockP50Ms).toBe(1500);
  });

  it('M1: estimates cost only when a rate is supplied, and only sums when EVERY record is costed', () => {
    const usage = { inputTokens: 1_000_000, outputTokens: 500_000 };
    const rate = { inputPerMillion: 2, outputPerMillion: 10 };
    const costed = recordFromOutcomes({
      scenarioId: 'a',
      stoppedReason: 'completed',
      outcomes: [],
      wallClockMs: 1000,
      tokenUsage: usage,
      tokenRateUsd: rate,
    });
    // 1M input @ $2/M + 0.5M output @ $10/M = $7.
    expect(costed.costUsd).toBe(7);
    const uncosted = recordFromOutcomes({
      scenarioId: 'b',
      stoppedReason: 'completed',
      outcomes: [],
      wallClockMs: 1000,
      tokenUsage: usage,
    });
    // No rate → cost ABSENT (never $0): an unknown price must read as "not measured".
    expect(uncosted.costUsd).toBeUndefined();
    // All-costed → total + avg present; ANY uncosted record → both absent (no silent partial sums).
    const all = summarizeAcceptanceRuns([costed, costed]);
    expect(all.totalCostUsd).toBe(14);
    expect(all.avgCostUsdPerRun).toBe(7);
    const mixed = summarizeAcceptanceRuns([costed, uncosted]);
    expect(mixed.totalCostUsd).toBeUndefined();
    expect(mixed.avgCostUsdPerRun).toBeUndefined();
  });
});
