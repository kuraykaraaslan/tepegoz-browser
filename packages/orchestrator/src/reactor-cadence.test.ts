import { beforeEach, describe, expect, it } from 'vitest';
import { ModelGateway, type CanonResponse, type ModelProvider } from '@tepegoz/model-gateway';
import { CapabilityRegistry, ToolGateway, type RegisteredTool } from '@tepegoz/capability-plane';
import type { AIProvider, RiskLevel, ToolDescriptor } from '@tepegoz/shared-types';
import Reactor from './reactor';

/**
 * The adaptive cadence measured where it matters: through the real loop, counting the periodic validator
 * passes an actual run spends (S7 PR2). The unit table lives in `should-validate.test.ts`; this asserts
 * the saving is real end to end and that nothing was starved to get it.
 */

class ScriptedProvider implements ModelProvider {
  readonly id: AIProvider = 'anthropic';
  private turn = 0;
  constructor(private readonly replies: readonly string[]) {}
  complete(): Promise<CanonResponse> {
    const text = this.replies[this.turn] ?? '{"action":"finish","summary":"done"}';
    this.turn += 1;
    return Promise.resolve({
      text,
      stopReason: 'end',
      usage: { inputTokens: 1, outputTokens: 1 },
      toolCalls: [],
    });
  }
}

function fakeTool(
  id: string,
  dangerClass: RiskLevel,
  result: () => unknown,
): RegisteredTool<unknown> {
  const descriptor: ToolDescriptor = {
    id,
    description: `fake ${id}`,
    dangerClass,
    source: 'builtin',
    inputSchema: { type: 'object' },
    requiresIdempotencyKey: false,
  };
  return {
    descriptor,
    inputSchema: {
      // Objects only. A validator that says yes to everything is refused at registration —
      // see CapabilityRegistry.register.
      safeParse: (data: unknown) =>
        typeof data === 'object' && data !== null
          ? { success: true as const, data }
          : { success: false as const, error: { issues: ['expected an object'] } },
    },
    handler: result,
  };
}

const tools = () =>
  CapabilityRegistry.list().map((d) => ({
    id: d.id,
    description: d.description,
    dangerClass: d.dangerClass,
  }));
const req = () => ({
  goal: 'read the page',
  tools: tools(),
  provider: 'anthropic' as const,
  model: 'mock',
});
const read = (n: number) =>
  JSON.stringify({ action: 'act', tool: 'browser_get_page', args: { n }, rationale: 'r' });

const ACTIONS = 12;
/** What the old fixed `planningInterval = 3` modulo would have spent on the same run. */
const OLD_MODULO_PASSES = Math.floor(ACTIONS / 3);

beforeEach(() => {
  ModelGateway.reset();
  CapabilityRegistry.reset();
  ToolGateway.reset();
});

/** Run `ACTIONS` reads and count the periodic validator passes. */
async function periodicPasses(pageFor: (i: number) => string): Promise<number> {
  let i = 0;
  CapabilityRegistry.register(
    fakeTool('browser_get_page', 'read', () => {
      i += 1;
      return { url: 'https://shop.test/a', title: 'Shop', content: pageFor(i) };
    }),
  );
  ModelGateway.register(new ScriptedProvider(Array.from({ length: ACTIONS }, (_, n) => read(n))));
  let passes = 0;
  await Reactor.run(req(), {
    maxSteps: ACTIONS + 2,
    validateCompletion: (ctx) => {
      if (ctx.trigger === 'periodic') passes += 1;
      return Promise.resolve({ done: false });
    },
  });
  return passes;
}

describe('periodic validation cadence, through the real loop', () => {
  it('spends FEWER validator passes on a page that never changes', async () => {
    // The saving this phase is for: re-judging identical inputs is a whole model round-trip bought with
    // nothing new to judge.
    const passes = await periodicPasses(() => 'the page is exactly the same every time');
    expect(passes).toBeLessThan(OLD_MODULO_PASSES);
    expect(passes).toBeGreaterThan(0); // still judged — starving the validator is not the goal
  });

  it('spends NO MORE than the old modulo on a page that changes every single step', async () => {
    // The churn case, which is where a naive "validate on change" would have been a cost REGRESSION on
    // exactly the busiest-looking pages. The floor makes that impossible rather than unlikely.
    const passes = await periodicPasses((n) => `live ticker value ${String(n)} changes constantly`);
    expect(passes).toBeLessThanOrEqual(OLD_MODULO_PASSES);
  });
});
