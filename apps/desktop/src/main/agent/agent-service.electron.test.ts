import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `AgentService` — the desktop adapter over the Electron-free `@tepegoz/agent-runtime`. Pinned:
 * `run` sets the tab-group topic, calls `runAgent` with the injected browser deps (tokenBudget only
 * when given), ALWAYS clears the process-global model pin (even when the run throws), and appends the
 * user+assistant turn to the bounded per-group memory (the `(no result …)` note when the summary is
 * empty); `conversationMemory` / `newConversation` read + reset that memory + the tab-group binding;
 * and the history methods (`beginHistoryTurn` reusing or minting a conversation id, `appendHistoryEvent`,
 * `openConversation` rebuilding memory from a stored detail, `currentConversation`).
 */

const runAgent = vi.hoisted(() =>
  vi.fn<(prompt: string, hooks: unknown, deps: unknown, history: unknown) => Promise<unknown>>(() =>
    Promise.resolve({ summary: 'did the thing', stoppedReason: 'done' }),
  ),
);
vi.mock('@tepegoz/agent-runtime', () => ({ runAgent }));

const gateway = vi.hoisted(() => ({ setModelOverride: vi.fn() }));
vi.mock('@tepegoz/model-gateway', () => ({ ModelGateway: gateway }));

const store = vi.hoisted(() => ({
  ensure: vi.fn(),
  addTurn: vi.fn(),
  appendEvent: vi.fn(),
  get: vi.fn((): unknown => null),
}));
vi.mock('@tepegoz/persistence', () => ({ AgentConversationStore: store }));

const tabGroup = vi.hoisted(() => ({ setTopic: vi.fn(), reset: vi.fn() }));
vi.mock('./agent-tab-group.electron', () => ({ default: tabGroup }));

vi.mock('../tabs', () => ({
  default: { getState: () => ({ tabs: [], activeId: null }), activeWebContents: () => null },
}));
vi.mock('../network/binding-service.electron', () => ({ default: { mayEgress: () => true } }));
vi.mock('./browser-host.electron', () => ({ runActiveTabUrl: () => 'https://active.test/' }));
vi.mock('../web/web-tools-host.electron', () => ({ discoverSitemap: vi.fn() }));
vi.mock('../local-inference/llama-engine.electron', () => ({
  llamaEngine: () => ({ __engine: true }),
}));
vi.mock('../model-catalog/model-manager.electron', () => ({
  default: { resolveModel: () => ({ id: 'local-1' }) },
}));
vi.mock('../lib/i18n-main', () => ({
  mainStrings: () => ({
    agent: {
      handoff: { captcha: 'c', twofa: 't', login: 'l' },
      tabSpawn: { opened: 'o', followBlocked: 'fb', returnedToOrigin: 'r' },
    },
  }),
}));

type Svc = typeof import('./agent-service.electron').default;
async function load(): Promise<Svc> {
  vi.resetModules();
  return (await import('./agent-service.electron')).default;
}

const DB = { __db: true } as never;
const hooks = {} as never;

beforeEach(() => {
  vi.clearAllMocks();
  runAgent.mockResolvedValue({ summary: 'did the thing', stoppedReason: 'done' });
  store.get.mockReturnValue(null);
});

describe('run', () => {
  it('sets the topic, calls runAgent with the injected deps, and clears the model pin', async () => {
    const svc = await load();
    await svc.run('do X', hooks, 'g1', 'display X');
    expect(tabGroup.setTopic).toHaveBeenCalledWith('g1', 'display X');
    const deps = runAgent.mock.calls[0]![2] as Record<string, unknown>;
    for (const fn of [
      'activeTabUrl',
      'tabUrl',
      'tabEgressBlocked',
      'listTabs',
      'discoverSitemap',
    ]) {
      expect(typeof deps[fn]).toBe('function');
    }
    expect(deps.handoffStrings).toEqual({ captcha: 'c', twofa: 't', login: 'l' });
    expect(deps.tabSpawnStrings).toEqual({
      opened: 'o',
      followBlocked: 'fb',
      returnedToOrigin: 'r',
    });
    expect(deps.tokenBudget).toBeUndefined();
    expect(gateway.setModelOverride).toHaveBeenCalledWith(null);
  });

  it('forwards a token budget when given', async () => {
    const svc = await load();
    await svc.run('x', hooks, 'g1', 'x', { quota: 100, lifetimeUsed: 10 });
    expect((runAgent.mock.calls[0]![2] as Record<string, unknown>).tokenBudget).toEqual({
      quota: 100,
      lifetimeUsed: 10,
    });
  });

  it('clears the model pin even when the run throws', async () => {
    const svc = await load();
    runAgent.mockRejectedValue(new Error('runtime blew up'));
    await expect(svc.run('x', hooks, 'g1')).rejects.toThrow('runtime blew up');
    expect(gateway.setModelOverride).toHaveBeenCalledWith(null);
  });

  it('records the user+assistant turn, with a "(no result …)" note when the summary is empty', async () => {
    const svc = await load();
    await svc.run('first', hooks, 'g1');
    expect(svc.conversationMemory('g1')).toEqual([
      { role: 'user', content: 'first' },
      { role: 'assistant', content: 'did the thing' },
    ]);

    runAgent.mockResolvedValue({ summary: '', stoppedReason: 'aborted' });
    await svc.run('second', hooks, 'g1');
    expect(svc.conversationMemory('g1').at(-1)).toEqual({
      role: 'assistant',
      content: '(no result — task stopped: aborted)',
    });
  });

  it('bounds the per-group memory to the last 20 messages', async () => {
    const svc = await load();
    for (let i = 0; i < 15; i++) await svc.run(`turn ${String(i)}`, hooks, 'g1');
    expect(svc.conversationMemory('g1')).toHaveLength(20);
  });
});

describe('conversation memory', () => {
  it('conversationMemory is [] for an unknown group', async () => {
    const svc = await load();
    expect(svc.conversationMemory('nope')).toEqual([]);
  });

  it('newConversation clears the memory and the tab-group binding', async () => {
    const svc = await load();
    await svc.run('x', hooks, 'g1');
    svc.newConversation('g1');
    expect(svc.conversationMemory('g1')).toEqual([]);
    expect(tabGroup.reset).toHaveBeenCalledWith('g1');
  });
});

describe('history', () => {
  it('beginHistoryTurn mints a conversation id the first time and reuses it after', async () => {
    const svc = await load();
    const a = svc.beginHistoryTurn(DB, {
      groupId: 'g1',
      runId: 'r1',
      prompt: 'p',
      attachments: [],
      ts: 1,
    });
    const b = svc.beginHistoryTurn(DB, {
      groupId: 'g1',
      runId: 'r2',
      prompt: 'p2',
      attachments: [],
      ts: 2,
    });
    expect(a.conversationId).toBe(b.conversationId);
    expect(a.turnId).not.toBe(b.turnId);
    expect(store.ensure).toHaveBeenCalledTimes(2);
    expect(store.addTurn).toHaveBeenCalledTimes(2);
  });

  it('appendHistoryEvent delegates to the store', async () => {
    const svc = await load();
    const ev = { kind: 'tool' } as never;
    svc.appendHistoryEvent(DB, 't1', ev);
    expect(store.appendEvent).toHaveBeenCalledWith(DB, 't1', ev);
  });

  it('openConversation returns null when the id is unknown', async () => {
    const svc = await load();
    expect(svc.openConversation(DB, 'gone', 'g1')).toBeNull();
  });

  it('openConversation rebuilds the group memory from the stored detail turns', async () => {
    const svc = await load();
    store.get.mockReturnValue({
      summary: { title: 'Trip planning' },
      turns: [
        { prompt: 'find flights', responseSummary: 'found 3', events: [] },
        { prompt: 'book one', responseSummary: undefined, events: [{ message: 'booked' }] },
        { prompt: 'silent', responseSummary: undefined, events: [] },
      ],
    });
    const detail = svc.openConversation(DB, 'c9', 'g1');
    expect(detail).not.toBeNull();
    expect(tabGroup.setTopic).toHaveBeenCalledWith('g1', 'Trip planning');
    expect(svc.conversationMemory('g1')).toEqual([
      { role: 'user', content: 'find flights' },
      { role: 'assistant', content: 'found 3' },
      { role: 'user', content: 'book one' },
      { role: 'assistant', content: 'booked' },
      { role: 'user', content: 'silent' },
    ]);
  });

  it('currentConversation is null before any turn, then reads the active conversation', async () => {
    const svc = await load();
    expect(svc.currentConversation(DB, 'g1')).toBeNull();
    svc.beginHistoryTurn(DB, { groupId: 'g1', runId: 'r', prompt: 'p', attachments: [], ts: 1 });
    store.get.mockReturnValue({ summary: { title: 'x' }, turns: [] });
    expect(svc.currentConversation(DB, 'g1')).not.toBeNull();
  });
});
