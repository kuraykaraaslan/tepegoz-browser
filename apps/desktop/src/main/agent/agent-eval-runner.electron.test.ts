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
vi.mock('@tepegoz/shared-types', () => ({ isRunnableProvider: () => true }));

const tm = vi.hoisted(() => ({
  getState: () => ({ tabs: [], activeId: null }),
  activeWebContents: () => ({ __wc: true }),
  createTab: () => 't1',
}));
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
  fs.readFileSync.mockReturnValue(JSON.stringify({ replies: ['reply one'] }));
  runAgent.mockResolvedValue({ summary: 'the answer', stoppedReason: 'done', steps: [] });
  browserHost.readPage.mockResolvedValue({ url: 'https://fixture.test/page', text: 'body text' });
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
});
