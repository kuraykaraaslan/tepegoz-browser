import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `ipc-agent.ts` — the agent-IPC facade. Two things it owns:
 *   - `registerAgentIpc` composes the six concern registrars — a missed one is an unwired domain;
 *   - `abortActiveAgentRuns` (called from before-quit) aborts every run AND fail-safe-DENIES every
 *     HITL prompt parked on a promise, so quit doesn't race a half-finished run against teardown.
 */

const abortAll = vi.hoisted(() => vi.fn());
vi.mock('../agent/agent-run-lock.electron', () => ({ abortAllAgentRunControllers: abortAll }));

const shared = vi.hoisted(() => ({
  agentRunByGroup: new Map<string, boolean>(),
  pendingApprovals: new Map<string, { resolve: (v: unknown) => void }>(),
  pendingPlans: new Map<string, { resolve: (v: unknown) => void }>(),
}));
vi.mock('./ipc-agent-shared', () => shared);

const reg = vi.hoisted(() => ({
  run: vi.fn(),
  control: vi.fn(),
  conversation: vi.fn(),
  skills: vi.fn(),
  background: vi.fn(),
  config: vi.fn(),
}));
vi.mock('./ipc-agent-run', () => ({ registerAgentRunIpc: reg.run }));
vi.mock('./ipc-agent-controls', () => ({ registerAgentControlIpc: reg.control }));
vi.mock('./ipc-agent-conversations', () => ({ registerAgentConversationIpc: reg.conversation }));
vi.mock('./ipc-agent-skills', () => ({
  registerAgentSkillsIpc: reg.skills,
  registerAgentBackgroundIpc: reg.background,
}));
vi.mock('./ipc-agent-config', () => ({ registerAgentConfigIpc: reg.config }));

const { registerAgentIpc, abortActiveAgentRuns } = await import('./ipc-agent');

beforeEach(() => {
  abortAll.mockClear();
  Object.values(reg).forEach((f) => f.mockClear());
  shared.agentRunByGroup.clear();
  shared.pendingApprovals.clear();
  shared.pendingPlans.clear();
});

describe('registerAgentIpc', () => {
  it('invokes all six concern registrars exactly once', () => {
    registerAgentIpc();
    for (const f of Object.values(reg)) expect(f).toHaveBeenCalledTimes(1);
  });
});

describe('abortActiveAgentRuns', () => {
  it('aborts every run controller and clears the per-group run map', () => {
    shared.agentRunByGroup.set('g1', true);
    abortActiveAgentRuns();
    expect(abortAll).toHaveBeenCalledTimes(1);
    expect(shared.agentRunByGroup.size).toBe(0);
  });

  it('fail-safe DENIES every pending approval and empties the map', () => {
    const a1 = vi.fn();
    const a2 = vi.fn();
    shared.pendingApprovals.set('ap1', { resolve: a1 });
    shared.pendingApprovals.set('ap2', { resolve: a2 });

    abortActiveAgentRuns();

    expect(a1).toHaveBeenCalledWith({ approved: false, remember: false, grantScope: false });
    expect(a2).toHaveBeenCalledWith({ approved: false, remember: false, grantScope: false });
    expect(shared.pendingApprovals.size).toBe(0);
  });

  it('fail-safe DENIES every pending plan and empties the map', () => {
    const p1 = vi.fn();
    shared.pendingPlans.set('pl1', { resolve: p1 });

    abortActiveAgentRuns();

    expect(p1).toHaveBeenCalledWith({ approved: false });
    expect(shared.pendingPlans.size).toBe(0);
  });

  it('is a no-op-safe call when nothing is in flight', () => {
    expect(() => abortActiveAgentRuns()).not.toThrow();
    expect(abortAll).toHaveBeenCalledTimes(1);
  });
});
