import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `maybeRunEval` — the env-gated AI-1 eval batch runner, INERT unless `TEPEGOZ_EVAL === '1'`. Pinned:
 * it returns immediately (no side effects) when the flag is off; with the flag on but a required env
 * var missing it logs an error and quits; a full scripted run reads the replies file, drives the
 * agent through the real path, writes the harness result JSON and quits; `TEPEGOZ_EVAL_STRICT=1`
 * forces the strict inbound guard on; and a thrown run writes an `{ error }` OUT file, still quitting.
 */

const fs = vi.hoisted(() => ({
  readFileSync: vi.fn(() => JSON.stringify({ replies: ['reply one'] })),
  writeFileSync: vi.fn(),
}));
vi.mock('node:fs', () => fs);

const appMock = vi.hoisted(() => ({ quit: vi.fn() }));
vi.mock('electron', () => ({ app: appMock }));

const logger = vi.hoisted(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }));
vi.mock('@tepegoz/libs', () => ({ Logger: logger }));

const setStrictMode = vi.hoisted(() => vi.fn());
vi.mock('@tepegoz/tool-executor', () => ({ setStrictMode }));

const runAgent = vi.hoisted(() =>
  vi.fn((): Promise<unknown> =>
    Promise.resolve({ summary: 'the answer', stoppedReason: 'done', steps: [] }),
  ),
);
vi.mock('@tepegoz/agent-runtime', () => ({ runAgent }));

class ScriptedProviderMock {
  constructor(
    public replies: string[],
    public id: string,
  ) {}
}
vi.mock('@tepegoz/model-gateway', () => ({
  ScriptedProvider: ScriptedProviderMock,
  AnthropicProvider: class {},
  OpenAIProvider: class {},
  GeminiProvider: class {},
  KimiProvider: class {},
  NovaProvider: class {},
  DeepSeekProvider: class {},
  XaiProvider: class {},
  GroqProvider: class {},
}));
const isRunnableProvider = vi.hoisted(() => vi.fn(() => true));
vi.mock('@tepegoz/shared-types', () => ({ isRunnableProvider }));

const tm = vi.hoisted(
  (): {
    activeWc: unknown;
    getState: ReturnType<typeof vi.fn>;
    activeWebContents: () => unknown;
    createTab: ReturnType<typeof vi.fn>;
  } => ({
    activeWc: { __wc: true },
    getState: vi.fn(() => ({
      tabs: [] as { id: string; url: string }[],
      activeId: null as string | null,
    })),
    activeWebContents: () => tm.activeWc,
    createTab: vi.fn((): string | null => 't1'),
  }),
);
vi.mock('../tabs', () => ({ default: tm }));

const browserHost = vi.hoisted(() => ({
  navigate: vi.fn(() => Promise.resolve()),
  waitForLoad: vi.fn(() => Promise.resolve()),
  listTabs: vi.fn(() => []),
  readPage: vi.fn(() => Promise.resolve({ url: 'https://fixture.test/page', text: 'body text' })),
}));
vi.mock('./browser-host.electron', () => ({ browserHost }));
vi.mock('../web/web-tools-host.electron', () => ({ discoverSitemap: vi.fn() }));
vi.mock('../lib/i18n-main', () => ({
  mainStrings: () => ({
    agent: {
      handoff: { captcha: 'c', twofa: 't', login: 'l' },
      tabSpawn: { opened: 'o', followBlocked: 'fb', returnedToOrigin: 'r' },
    },
  }),
}));
vi.mock('../local-inference/llama-engine.electron', () => ({ llamaEngine: () => ({}) }));
vi.mock('../model-catalog/model-manager.electron', () => ({
  default: { resolveModel: () => ({}) },
}));

const { maybeRunEval } = await import('./agent-eval-runner.electron');

const EVAL_KEYS = [
  'TEPEGOZ_EVAL',
  'TEPEGOZ_EVAL_STRICT',
  'TEPEGOZ_EVAL_PROMPT',
  'TEPEGOZ_EVAL_FIXTURE_URL',
  'TEPEGOZ_EVAL_OUT',
  'TEPEGOZ_EVAL_MODE',
  'TEPEGOZ_EVAL_SCRIPT',
  'TEPEGOZ_EVAL_RUN_CEILING',
  'TEPEGOZ_EVAL_PROVIDER',
  'TEPEGOZ_EVAL_API_KEY',
];
function fullEnv(): void {
  process.env['TEPEGOZ_EVAL'] = '1';
  process.env['TEPEGOZ_EVAL_PROMPT'] = 'find the price';
  process.env['TEPEGOZ_EVAL_FIXTURE_URL'] = 'https://fixture.test/page';
  process.env['TEPEGOZ_EVAL_OUT'] = '/tmp/eval-out.json';
  process.env['TEPEGOZ_EVAL_SCRIPT'] = '/tmp/replies.json';
}

beforeEach(() => {
  vi.clearAllMocks();
  fs.writeFileSync.mockReset(); // a test overrides its impl to throw; clearAllMocks would keep that
  fs.readFileSync.mockReturnValue(JSON.stringify({ replies: ['reply one'] }));
  runAgent.mockResolvedValue({ summary: 'the answer', stoppedReason: 'done', steps: [] });
  browserHost.readPage.mockResolvedValue({ url: 'https://fixture.test/page', text: 'body text' });
  isRunnableProvider.mockReturnValue(true);
  tm.activeWc = { __wc: true };
  tm.createTab.mockReturnValue('t1');
  tm.getState.mockReturnValue({ tabs: [], activeId: null });
});
afterEach(() => {
  for (const k of EVAL_KEYS) delete process.env[k];
});

it('is completely inert when TEPEGOZ_EVAL is not "1"', async () => {
  await maybeRunEval();
  expect(runAgent).not.toHaveBeenCalled();
  expect(appMock.quit).not.toHaveBeenCalled();
});

it('logs an error and quits when a required env var is missing', async () => {
  process.env['TEPEGOZ_EVAL'] = '1'; // no PROMPT / FIXTURE_URL / OUT
  await maybeRunEval();
  expect(logger.error).toHaveBeenCalledWith(
    '[eval] TEPEGOZ_EVAL=1 but a required env var is missing',
    expect.anything(),
  );
  expect(appMock.quit).toHaveBeenCalled();
  expect(runAgent).not.toHaveBeenCalled();
});

describe('a full scripted run', () => {
  it('reads the replies file, runs the agent, writes the result JSON and quits', async () => {
    fullEnv();
    await maybeRunEval();

    expect(fs.readFileSync).toHaveBeenCalledWith('/tmp/replies.json', 'utf8');
    expect(browserHost.navigate).toHaveBeenCalledWith('https://fixture.test/page');
    const runArgs = runAgent.mock.calls[0]! as unknown[];
    expect(runArgs[0]).toBe('find the price');
    const { provider } = runArgs[2] as { provider: { id: string; instance: unknown } };
    expect(provider.id).toBe('anthropic');
    expect(provider.instance).toBeInstanceOf(ScriptedProviderMock);
    expect((provider.instance as ScriptedProviderMock).replies).toEqual(['reply one']);

    const [outPath, json] = fs.writeFileSync.mock.calls[0]! as [string, string];
    expect(outPath).toBe('/tmp/eval-out.json');
    expect(JSON.parse(json)).toMatchObject({
      summary: 'the answer',
      stoppedReason: 'done',
      finalUrl: 'https://fixture.test/page',
      finalPageText: 'body text',
    });
    expect(appMock.quit).toHaveBeenCalled();
  });

  it('honours TEPEGOZ_EVAL_STRICT=1', async () => {
    fullEnv();
    process.env['TEPEGOZ_EVAL_STRICT'] = '1';
    await maybeRunEval();
    expect(setStrictMode).toHaveBeenCalledWith(true);
  });

  it('writes an { error } OUT file (still quitting) when the run throws', async () => {
    fullEnv();
    runAgent.mockRejectedValue(new Error('agent blew up'));
    await maybeRunEval();
    const calls = fs.writeFileSync.mock.calls as [string, string][];
    const errWrite = calls.find(([, body]) => body.includes('agent blew up'));
    expect(errWrite).toBeDefined();
    expect(JSON.parse(errWrite![1])).toEqual({ error: 'Error: agent blew up' });
    expect(appMock.quit).toHaveBeenCalled();
  });

  it('fails into the { error } path when the scripted tier has no TEPEGOZ_EVAL_SCRIPT', async () => {
    fullEnv();
    delete process.env['TEPEGOZ_EVAL_SCRIPT'];
    await maybeRunEval();
    expect(runAgent).not.toHaveBeenCalled();
    const calls = fs.writeFileSync.mock.calls as [string, string][];
    const errWrite = calls.find(([, body]) => body.includes('TEPEGOZ_EVAL_SCRIPT'));
    expect(errWrite).toBeDefined();
    expect(appMock.quit).toHaveBeenCalled();
  });

  it('fails into the { error } path when the replies file is not valid JSON schema', async () => {
    fullEnv();
    fs.readFileSync.mockReturnValue(JSON.stringify({ notReplies: true }));
    await maybeRunEval();
    expect(runAgent).not.toHaveBeenCalled();
    expect(fs.writeFileSync).toHaveBeenCalledWith(
      '/tmp/eval-out.json',
      expect.stringContaining('error'),
      'utf8',
    );
  });

  it('opens the entry tab through the UI path when the window comes up tab-less', async () => {
    fullEnv();
    tm.activeWc = null; // brand-new profile: no active webContents yet
    await maybeRunEval();
    expect(tm.createTab).toHaveBeenCalledWith('https://fixture.test/page');
    expect(browserHost.waitForLoad).toHaveBeenCalled();
    expect(browserHost.navigate).not.toHaveBeenCalled();
  });

  it('passes working activeTabUrl / tabUrl callbacks and an onEvent hook to the agent', async () => {
    fullEnv();
    await maybeRunEval();
    const args = runAgent.mock.calls[0] as unknown as unknown[];
    const hooks = args[1] as {
      onEvent: (k: string, m: string, d?: string) => void;
      requestPlanApproval: () => Promise<{ approved: boolean }>;
      requestApproval: () => Promise<boolean>;
    };
    const cfg = args[2] as {
      activeTabUrl: () => string | undefined;
      tabUrl: (id: string) => string | undefined;
      listTabs: () => unknown[];
      localInference: { resolveModel: () => unknown };
    };

    // Unattended eval auto-approves every HITL gate, reachable only under TEPEGOZ_EVAL.
    await expect(hooks.requestPlanApproval()).resolves.toEqual({ approved: true });
    await expect(hooks.requestApproval()).resolves.toBe(true);
    expect(cfg.listTabs()).toEqual([]);
    expect(browserHost.listTabs).toHaveBeenCalled();
    expect(cfg.localInference.resolveModel()).toEqual({});

    // empty tab state -> both resolve to undefined
    expect(cfg.activeTabUrl()).toBeUndefined();
    expect(cfg.tabUrl('t1')).toBeUndefined();

    tm.getState.mockReturnValue({
      tabs: [{ id: 't1', url: 'https://tab.test/x' }],
      activeId: 't1',
    });
    expect(cfg.activeTabUrl()).toBe('https://tab.test/x');
    expect(cfg.tabUrl('t1')).toBe('https://tab.test/x');
    expect(cfg.tabUrl('ghost')).toBeUndefined();

    expect(() => {
      hooks.onEvent('step', 'clicked', 'detail-here');
    }).not.toThrow();
    expect(logger.info).toHaveBeenCalledWith('[eval] step: clicked', { detail: 'detail-here' });

    hooks.onEvent('step', 'clicked');
    expect(logger.info).toHaveBeenCalledWith('[eval] step: clicked', { detail: '' });
  });

  it('defaults a missing summary/steps in the written result', async () => {
    fullEnv();
    runAgent.mockResolvedValue({ stoppedReason: 'done' });
    await maybeRunEval();
    const [, json] = fs.writeFileSync.mock.calls[0]! as [string, string];
    expect(JSON.parse(json)).toMatchObject({ summary: '', steps: [] });
  });

  it('records completionOutcome + visionEscalations in the result when the run reports them', async () => {
    fullEnv();
    runAgent.mockResolvedValue({
      summary: 'a',
      stoppedReason: 'done',
      steps: [],
      completionOutcome: 'confirmed',
      visionEscalations: 2,
    });
    await maybeRunEval();
    const [, json] = fs.writeFileSync.mock.calls[0]! as [string, string];
    expect(JSON.parse(json)).toMatchObject({ completionOutcome: 'confirmed', visionEscalations: 2 });
  });

  it('self-heals a not-ready entry page by retrying the readiness barrier', async () => {
    fullEnv();
    browserHost.readPage.mockResolvedValueOnce({ url: 'about:blank', text: '' });
    await maybeRunEval();
    expect(runAgent).toHaveBeenCalled();
    expect(fs.writeFileSync).toHaveBeenCalledWith(
      '/tmp/eval-out.json',
      expect.stringContaining('finalUrl'),
      'utf8',
    );
  });

  it('gives up once the readiness deadline passes and surfaces the last not-ready error', async () => {
    fullEnv();
    vi.useFakeTimers();
    try {
      browserHost.readPage.mockResolvedValue({ url: 'about:blank', text: '' });
      const run = maybeRunEval();
      await vi.advanceTimersByTimeAsync(30_000);
      await run;
    } finally {
      vi.useRealTimers();
    }
    expect(runAgent).not.toHaveBeenCalled();
    const calls = fs.writeFileSync.mock.calls as [string, string][];
    const errWrite = calls.find(([, body]) => body.includes('entry page not ready'));
    expect(errWrite).toBeDefined();
    expect(appMock.quit).toHaveBeenCalled();
  });

  it('swallows a failure to write the { error } OUT file, still quitting', async () => {
    fullEnv();
    runAgent.mockRejectedValue(new Error('agent blew up'));
    fs.writeFileSync.mockImplementation(() => {
      throw new Error('disk full');
    });
    await expect(maybeRunEval()).resolves.toBeUndefined();
    expect(appMock.quit).toHaveBeenCalled();
  });

  it('threads the run-token ceiling through, treating garbage / non-positive as "off"', async () => {
    const ceiling = () =>
      ((runAgent.mock.calls[0] as unknown as unknown[])[2] as { runTokenCeiling: number })
        .runTokenCeiling;
    fullEnv();
    process.env['TEPEGOZ_EVAL_RUN_CEILING'] = '12000';
    await maybeRunEval();
    expect(ceiling()).toBe(12000);

    runAgent.mockClear();
    process.env['TEPEGOZ_EVAL_RUN_CEILING'] = 'not-a-number';
    await maybeRunEval();
    expect(ceiling()).toBe(0);

    runAgent.mockClear();
    process.env['TEPEGOZ_EVAL_RUN_CEILING'] = '-5';
    await maybeRunEval();
    expect(ceiling()).toBe(0);
  });
});

describe('live tier provider construction', () => {
  const live = (provider?: string): void => {
    fullEnv();
    delete process.env['TEPEGOZ_EVAL_SCRIPT'];
    process.env['TEPEGOZ_EVAL_MODE'] = 'live';
    process.env['TEPEGOZ_EVAL_API_KEY'] = 'sk-live';
    if (provider !== undefined) process.env['TEPEGOZ_EVAL_PROVIDER'] = provider;
  };
  const providerOf = () =>
    (
      (runAgent.mock.calls[0] as unknown as unknown[])[2] as {
        provider: { id: string; instance: unknown };
      }
    ).provider;

  it.each([
    ['openai', 'OpenAIProvider'],
    ['gemini', 'GeminiProvider'],
    ['kimi', 'KimiProvider'],
    ['nova', 'NovaProvider'],
    ['deepseek', 'DeepSeekProvider'],
    ['xai', 'XaiProvider'],
    ['groq', 'GroqProvider'],
  ])('builds a %s provider from the eval env key', async (id, ctorName) => {
    live(id);
    const gw = await import('@tepegoz/model-gateway');
    await maybeRunEval();
    const p = providerOf();
    expect(p.id).toBe(id);
    expect(p.instance).toBeInstanceOf(
      (gw as unknown as Record<string, new () => unknown>)[ctorName]!,
    );
  });

  it('defaults to Anthropic when no provider is named', async () => {
    live();
    const gw = await import('@tepegoz/model-gateway');
    await maybeRunEval();
    const p = providerOf();
    expect(p.id).toBe('anthropic');
    expect(p.instance).toBeInstanceOf(gw.AnthropicProvider);
  });

  it('fails into the { error } OUT file when the API key is missing', async () => {
    live('openai');
    delete process.env['TEPEGOZ_EVAL_API_KEY'];
    await maybeRunEval();
    expect(runAgent).not.toHaveBeenCalled();
    expect(fs.writeFileSync).toHaveBeenCalledWith(
      '/tmp/eval-out.json',
      expect.stringContaining('TEPEGOZ_EVAL_API_KEY'),
      'utf8',
    );
  });

  it('fails into the { error } OUT file when the named provider is not runnable', async () => {
    live('openai');
    isRunnableProvider.mockReturnValue(false);
    await maybeRunEval();
    expect(runAgent).not.toHaveBeenCalled();
    expect(fs.writeFileSync).toHaveBeenCalledWith(
      '/tmp/eval-out.json',
      expect.stringContaining('not runnable'),
      'utf8',
    );
  });
});
