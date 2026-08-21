import { beforeEach, describe, expect, it } from 'vitest';
import CapabilityRegistry from './registry';
import type { RegisteredTool } from './types';

/**
 * DevTools is exposed to the **user** and is never an agent capability (Phase 2b, ADR-0029).
 *
 * A committed test rather than a line in a document, because the failure it guards against is the
 * plausible one: somebody adds a `devtools_get_console` tool to help the agent debug a stuck page, and
 * it looks helpful right up until a prompt-injected model uses a scriptable console attached to an
 * authenticated session. The tool plane has one gateway; this asserts what may not enter it.
 */

const devtoolsish = (id: string): RegisteredTool<unknown> => ({
  descriptor: {
    id,
    description: 'x',
    dangerClass: 'read',
    source: 'builtin',
    inputSchema: { type: 'object' },
    requiresIdempotencyKey: false,
  },
  inputSchema: {
    // Objects only — a validator that accepts anything is rejected at registration, by design.
    safeParse: (data: unknown) =>
      typeof data === 'object' && data !== null
        ? { success: true as const, data }
        : { success: false as const, error: { issues: ['expected an object'] } },
  },
  handler: () => null,
});

beforeEach(() => {
  CapabilityRegistry.reset();
});

describe('the tool plane', () => {
  it('registers no devtools tool by default', () => {
    const ids = CapabilityRegistry.list().map((d) => d.id);
    expect(ids.filter((id) => id.includes('devtools'))).toEqual([]);
  });

  it('would SURFACE one if it were ever added — this test is the tripwire', () => {
    // Registering it here proves the assertion above can actually fail; a guard that cannot fail is
    // decoration.
    CapabilityRegistry.register(devtoolsish('devtools_get_console'));
    const ids = CapabilityRegistry.list().map((d) => d.id);
    expect(ids.filter((id) => id.includes('devtools'))).toEqual(['devtools_get_console']);
  });
});
