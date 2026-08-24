import { beforeEach, describe, expect, it, vi } from 'vitest';

const list = vi.fn();
const evaluate = vi.fn();

vi.mock('@tepegoz/capability-plane', () => ({
  CapabilityRegistry: { list: () => list() as unknown },
}));
vi.mock('@tepegoz/security-policy', () => ({
  PolicyKernel: { evaluate: (...a: unknown[]) => evaluate(...a) as unknown },
}));

const { agentCapabilityMatrix } = await import('./agent-matrix');

/**
 * The matrix is a VIEW over the Policy Kernel, and these tests exist to keep it one. The failure they
 * guard against is not a rendering bug — it is the matrix quietly growing its own copy of the rules,
 * because the moment it disagrees with the kernel the user is reading a UI that confidently
 * contradicts the thing actually in force.
 */
beforeEach(() => {
  vi.clearAllMocks();
  evaluate.mockImplementation(({ descriptor }: { descriptor: { dangerClass: string } }) => ({
    decision: descriptor.dangerClass === 'read' ? 'allow' : 'ask',
  }));
});

function tools(...specs: [id: string, dangerClass: string][]) {
  list.mockReturnValue(specs.map(([id, dangerClass]) => ({ id, dangerClass, source: 'builtin' })));
}

describe('agentCapabilityMatrix', () => {
  it('asks the KERNEL for every registered tool, rather than deciding anything itself', () => {
    tools(['browser_get_page', 'read'], ['file_delete_item', 'destructive']);
    const rows = agentCapabilityMatrix();
    expect(evaluate).toHaveBeenCalledTimes(2);
    expect(rows).toEqual([
      { id: 'browser_get_page', dangerClass: 'read', decision: 'allow' },
      { id: 'file_delete_item', dangerClass: 'destructive', decision: 'ask' },
    ]);
  });

  it('reports whatever the kernel says, including a change this file knows nothing about', () => {
    // The point of the view: a policy change shows up here without this module being edited. If it
    // needed a matching edit, it would be a second engine.
    tools(['x', 'read']);
    evaluate.mockReturnValue({ decision: 'deny' });
    expect(agentCapabilityMatrix()[0]?.decision).toBe('deny');
  });

  it('evaluates the BASELINE — untainted, no target site', () => {
    // Taint and the sensitive-site lockout can only TIGHTEN a verdict, so this is the most permissive
    // answer the kernel gives and therefore the honest ceiling to display. Showing a best case as if
    // it were the only case is what the UI subtitle exists to prevent.
    tools(['x', 'read']);
    agentCapabilityMatrix();
    const [ctx] = evaluate.mock.calls[0] as [Record<string, unknown>];
    expect(ctx.taintedArgs).toBe(false);
    expect(ctx.targetUrl).toBeUndefined();
  });

  it('is ordered by id, so the list does not reshuffle between reads', () => {
    tools(['z_tool', 'read'], ['a_tool', 'read'], ['m_tool', 'read']);
    expect(agentCapabilityMatrix().map((r) => r.id)).toEqual(['a_tool', 'm_tool', 'z_tool']);
  });

  it('is empty, not broken, when nothing is registered', () => {
    tools();
    expect(agentCapabilityMatrix()).toEqual([]);
  });
});
