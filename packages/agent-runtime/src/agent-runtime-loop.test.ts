import { afterEach, describe, expect, it, vi } from 'vitest';
import { ToolGateway } from '@tepegoz/capability-plane';
import type { StepOutcome } from '@tepegoz/orchestrator';
import { advanceTabLifecycle, originTabFor, spawnedTabFromResult } from './agent-runtime-loop';
import type { AgentRunDeps, AgentRunHooks } from './agent-runtime-types';

/** S3 PR3 tab-spawn world model: policy-checked auto-follow + return-to-origin bookkeeping. */

const TABS = { origin: 'origin', spawned: 'spawned' };

function outcome(overrides: Partial<StepOutcome> = {}): StepOutcome {
  return {
    stepId: 's1',
    tool: 'browser_update_page',
    ok: true,
    durationMs: 1,
    ...overrides,
  };
}

function deps(over: Partial<AgentRunDeps> = {}): AgentRunDeps {
  return {
    activeTabUrl: () => undefined,
    tabUrl: (tabId) => (tabId === TABS.origin ? 'https://a.example' : undefined),
    handoffStrings: { captcha: '', twofa: '', login: '' },
    tabSpawnStrings: { opened: 'opened', followBlocked: 'blocked', returnedToOrigin: 'returned' },
    listTabs: () => [
      { id: TABS.origin, url: 'https://a.example', title: 'A', active: true },
      { id: TABS.spawned, url: 'https://a.example/new', title: 'New', active: false },
    ],
    ...over,
  };
}

function hooks(): AgentRunHooks & { onEvent: ReturnType<typeof vi.fn> } {
  return {
    onEvent: vi.fn(),
    requestPlanApproval: () => Promise.resolve({ approved: false }),
    requestApproval: () => Promise.resolve(false),
    signal: { aborted: false },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('spawnedTabFromResult', () => {
  it('reads the first opened tab off a browser_update_page result', () => {
    expect(
      spawnedTabFromResult({ ok: true, openedTabs: [{ id: 't2', url: 'https://x', title: 'X' }] }),
    ).toEqual({ id: 't2', url: 'https://x', title: 'X' });
  });

  it('is undefined for a result with no openedTabs, or a malformed entry', () => {
    expect(spawnedTabFromResult({ ok: true })).toBeUndefined();
    expect(spawnedTabFromResult({ ok: true, openedTabs: [] })).toBeUndefined();
    expect(spawnedTabFromResult({ ok: true, openedTabs: [{ id: 't2' }] })).toBeUndefined();
    expect(spawnedTabFromResult(null)).toBeUndefined();
    expect(spawnedTabFromResult('nope')).toBeUndefined();
  });
});

describe('originTabFor', () => {
  it("prefers the click's own explicit tabId over the host-reported active tab", () => {
    const d = deps({
      listTabs: () => [{ id: 'other-active', url: 'https://a', title: 'A', active: true }],
    });
    expect(originTabFor({ id: TABS.spawned }, { tabId: 'explicit-origin' }, d)).toBe(
      'explicit-origin',
    );
  });

  it('falls back to the active tab when the call omitted tabId', () => {
    expect(originTabFor({ id: TABS.spawned }, {}, deps())).toBe(TABS.origin);
  });

  it('refuses to guess when the "active" tab already reads as the spawned tab itself', () => {
    const d = deps({
      listTabs: () => [{ id: TABS.spawned, url: 'https://a', title: 'A', active: true }],
    });
    expect(originTabFor({ id: TABS.spawned }, {}, d)).toBeUndefined();
  });

  it('is undefined when no tab is known to be active and none was given explicitly', () => {
    expect(originTabFor({ id: TABS.spawned }, {}, deps({ listTabs: () => [] }))).toBeUndefined();
  });
});

describe('advanceTabLifecycle', () => {
  it('does nothing when the step opened no tab and nothing is being followed', async () => {
    const invoke = vi.spyOn(ToolGateway, 'invoke');
    const h = hooks();
    const next = await advanceTabLifecycle(outcome({ result: { ok: true } }), undefined, deps(), h);
    expect(next).toBeUndefined();
    expect(invoke).not.toHaveBeenCalled();
    expect(h.onEvent).not.toHaveBeenCalled();
  });

  it('follows a spawned tab through tab_update_item when the Policy Kernel allows it', async () => {
    const invoke = vi
      .spyOn(ToolGateway, 'invoke')
      .mockResolvedValue({ id: TABS.spawned, active: true });
    const h = hooks();
    const result = outcome({
      args: {},
      result: {
        ok: true,
        openedTabs: [{ id: TABS.spawned, url: 'https://a.example/new', title: 'New' }],
      },
    });
    const next = await advanceTabLifecycle(result, undefined, deps(), h);
    expect(next).toEqual({ actingTabId: TABS.spawned, originTabId: TABS.origin });
    expect(invoke).toHaveBeenCalledWith(
      'tab_update_item',
      { id: TABS.spawned },
      { targetUrl: 'https://a.example/new', taintedArgs: true },
    );
    expect(h.onEvent).toHaveBeenCalledWith('tab_spawn', 'opened', 'New — https://a.example/new');
  });

  it('does not follow when the Policy Kernel/HITL declines — reported only, exactly like today', async () => {
    const invoke = vi
      .spyOn(ToolGateway, 'invoke')
      .mockResolvedValue({ id: TABS.spawned, active: false });
    const h = hooks();
    const result = outcome({
      args: {},
      result: {
        ok: true,
        openedTabs: [{ id: TABS.spawned, url: 'https://a.example/new', title: 'New' }],
      },
    });
    const next = await advanceTabLifecycle(result, undefined, deps(), h);
    expect(next).toBeUndefined();
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(h.onEvent).toHaveBeenCalledWith('tab_spawn', 'blocked', 'New — https://a.example/new');
  });

  it('never attempts a follow while already following another tab', async () => {
    const invoke = vi.spyOn(ToolGateway, 'invoke');
    const h = hooks();
    const already = { actingTabId: TABS.spawned, originTabId: TABS.origin };
    const result = outcome({
      result: {
        ok: true,
        openedTabs: [{ id: 'third', url: 'https://a.example/third', title: 'Third' }],
      },
    });
    const next = await advanceTabLifecycle(result, already, deps(), h);
    expect(next).toEqual(already);
    expect(invoke).not.toHaveBeenCalled();
  });

  it('returns to origin once the followed tab is no longer open, on ANY later step', async () => {
    const invoke = vi
      .spyOn(ToolGateway, 'invoke')
      .mockResolvedValue({ id: TABS.origin, active: true });
    const h = hooks();
    const following = { actingTabId: TABS.spawned, originTabId: TABS.origin };
    // The spawned tab already closed — listTabs no longer reports it — and this step is an unrelated read.
    const d = deps({
      listTabs: () => [{ id: TABS.origin, url: 'https://a.example', title: 'A', active: false }],
    });
    const next = await advanceTabLifecycle(
      outcome({ tool: 'browser_get_page', result: { ok: true } }),
      following,
      d,
      h,
    );
    expect(next).toBeUndefined();
    expect(invoke).toHaveBeenCalledWith(
      'tab_update_item',
      { id: TABS.origin },
      { targetUrl: 'https://a.example', taintedArgs: false },
    );
    expect(h.onEvent).toHaveBeenCalledWith('tab_spawn', 'returned');
  });

  it('a failed step never starts a follow, even if a stale result carried openedTabs', async () => {
    const invoke = vi.spyOn(ToolGateway, 'invoke');
    const h = hooks();
    const result = outcome({
      ok: false,
      error: { isError: true, code: 'INTERNAL_ERROR', message: 'boom', retryable: true },
      result: {
        ok: true,
        openedTabs: [{ id: TABS.spawned, url: 'https://a.example/new', title: 'New' }],
      },
    });
    const next = await advanceTabLifecycle(result, undefined, deps(), h);
    expect(next).toBeUndefined();
    expect(invoke).not.toHaveBeenCalled();
  });
});
