import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { EvalScenario } from '@tepegoz/shared-types';
import type { FixtureServer } from './fixture-server';
import { CUT_OFF, isDeadKeyError, isTransportInvalid } from './harness-run';

/**
 * The transport-invalid classifier is the load-bearing half of the wholesale flake fix: a launch /
 * navigation race (cold fixture load, ERR_FAILED, "No active page") must be EXCLUDED from k/N, never
 * scored as the agent getting it wrong — while a real escape that happens to end in a nav timeout stays a
 * genuine competence FAILURE. These cases pin that boundary.
 */
describe('isTransportInvalid', () => {
  it('flags a CUT_OFF trial (no output) regardless of escape', () => {
    expect(isTransportInvalid({ error: CUT_OFF }, false)).toBe(true);
    expect(isTransportInvalid({ error: CUT_OFF }, true)).toBe(true);
  });

  it('flags a navigation_timeout / transient_error that did NOT escape (a cold-start transport race)', () => {
    expect(isTransportInvalid({ stoppedReason: 'navigation_timeout' }, false)).toBe(true);
    expect(isTransportInvalid({ stoppedReason: 'transient_error' }, false)).toBe(true);
  });

  it('does NOT excuse an ESCAPE that ended in a nav timeout — that is a real competence failure', () => {
    // The agent navigated off-site to an unreachable URL and spun out. Scored, not excluded.
    expect(isTransportInvalid({ stoppedReason: 'navigation_timeout' }, true)).toBe(false);
    expect(isTransportInvalid({ stoppedReason: 'transient_error' }, true)).toBe(false);
  });

  it('treats a run that RAN (completed / max_steps / loop_detected) as valid competence evidence', () => {
    expect(isTransportInvalid({ stoppedReason: 'completed' }, false)).toBe(false);
    expect(isTransportInvalid({ stoppedReason: 'max_steps' }, false)).toBe(false);
    expect(isTransportInvalid({ stoppedReason: 'loop_detected' }, false)).toBe(false);
  });

  it('flags a TRANSIENT infra error string (rate limit / overload / network) as invalid + retryable', () => {
    expect(isTransportInvalid({ error: 'AppError: 429 rate_limit_error' }, false)).toBe(true);
    expect(isTransportInvalid({ error: 'Overloaded (529)' }, false)).toBe(true);
    expect(isTransportInvalid({ error: 'ECONNRESET' }, false)).toBe(true);
  });

  it('a finished trial with no stoppedReason and no error is valid (not transport-invalid)', () => {
    expect(isTransportInvalid({}, false)).toBe(false);
    expect(isTransportInvalid({ stoppedReason: undefined }, false)).toBe(false);
  });
});

describe('isDeadKeyError', () => {
  it('flags a billing / credit-exhaustion error (no retry can fix it → the sweep must abort)', () => {
    // The exact shape that silently turned a real Anthropic sweep into garbage the moment credits ran out.
    const billing =
      'AppError: 400 {"type":"error","error":{"type":"invalid_request_error","message":"Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits."}}';
    expect(isDeadKeyError({ error: billing })).toBe(true);
  });

  it('flags quota / auth exhaustion (401 / authentication / invalid api key)', () => {
    expect(isDeadKeyError({ error: 'insufficient_quota' })).toBe(true);
    expect(isDeadKeyError({ error: 'AppError: 401 authentication_error' })).toBe(true);
    expect(isDeadKeyError({ error: 'invalid api key' })).toBe(true);
  });

  it('does NOT flag a transport race, a transient error, CUT_OFF, or a normal run as dead-key', () => {
    expect(isDeadKeyError({ stoppedReason: 'navigation_timeout' })).toBe(false);
    expect(isDeadKeyError({ error: 'AppError: 429 rate_limit_error' })).toBe(false); // transient, retryable
    expect(isDeadKeyError({ error: CUT_OFF })).toBe(false);
    expect(isDeadKeyError({ stoppedReason: 'completed' })).toBe(false);
    expect(isDeadKeyError({})).toBe(false);
  });
});

/**
 * `planRun` decides what the app is pointed at and what env it is handed for ONE scenario — the two
 * inputs that determine whether a trial measures anything at all. The rules worth pinning are the
 * REFUSALS (null, so the scenario is skipped and logged rather than silently counted as a failure) and
 * the tier split: the scripted tier writes a replay file and never carries a key, the live tier carries
 * the key and forwards a ceiling only when one is set.
 */
describe('planRun', () => {
  const server: FixtureServer = {
    url: 'http://127.0.0.1:9',
    altUrl: 'http://127.0.0.1:10',
    port: 9,
    close: () => Promise.resolve(),
  };

  const scenario = (
    id: string,
    target: EvalScenario['target'] = { fixture: 'blog-behind-nav' },
  ): EvalScenario => ({
    id,
    task: `task ${id}`,
    target,
    success: { domAssertion: 'x' },
    heldOut: false,
    tags: ['smoke'],
  });

  let work: string;

  beforeEach(() => {
    work = mkdtempSync(join(tmpdir(), 'tepegoz-planrun-'));
  });
  afterEach(() => {
    rmSync(work, { recursive: true, force: true });
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  /** `harness-config` reads the env once at module load, so each tier needs a fresh module graph. */
  async function load(env: Record<string, string | undefined>) {
    vi.resetModules();
    for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
    return import('./harness-run');
  }

  describe('scripted tier', () => {
    it('refuses (null) a scenario with no scripted sequence — skipped and logged, not scored 0', async () => {
      const { planRun } = await load({ TEPEGOZ_EVAL_MODE: undefined });
      expect(planRun(scenario('no_such_script'), server, work)).toBeNull();
    });

    it('refuses (null) a realUrl target — the deterministic tier never leaves the fixture server', async () => {
      const { planRun } = await load({ TEPEGOZ_EVAL_MODE: undefined });
      const target = { realUrl: 'https://example.com' };
      expect(planRun(scenario('blog_behind_menu', target), server, work)).toBeNull();
    });

    it('writes the replay file and points the app at the fixture, carrying no API key', async () => {
      const { planRun } = await load({
        TEPEGOZ_EVAL_MODE: undefined,
        TEPEGOZ_EVAL_API_KEY: 'sk-should-not-be-forwarded',
      });
      const plan = planRun(scenario('blog_behind_menu'), server, work);
      expect(plan).not.toBeNull();
      expect(plan?.entryUrl).toBe('http://127.0.0.1:9/blog-behind-nav/index.html');
      expect(plan?.env.TEPEGOZ_EVAL_MODE).toBe('scripted');
      expect(plan?.env.TEPEGOZ_EVAL_API_KEY).toBeUndefined();

      const scriptPath = plan?.env.TEPEGOZ_EVAL_SCRIPT ?? '';
      expect(scriptPath).toBe(join(work, 'blog_behind_menu.script.json'));
      const written = JSON.parse(readFileSync(scriptPath, 'utf8')) as {
        provider: string;
        replies: string[];
      };
      expect(written.provider).toBe('anthropic');
      expect(written.replies.length).toBeGreaterThan(1);
    });
  });

  describe('live tier', () => {
    it('forwards the provider and key, and resolves a fixture target to its index page', async () => {
      const { planRun } = await load({
        TEPEGOZ_EVAL_MODE: 'live',
        TEPEGOZ_EVAL_PROVIDER: 'openai',
        TEPEGOZ_EVAL_API_KEY: 'sk-live',
        TEPEGOZ_EVAL_RUN_CEILING: undefined,
      });
      const plan = planRun(scenario('anything_at_all'), server, work);
      expect(plan?.entryUrl).toBe('http://127.0.0.1:9/blog-behind-nav/index.html');
      expect(plan?.env).toEqual({
        TEPEGOZ_EVAL_MODE: 'live',
        TEPEGOZ_EVAL_PROVIDER: 'openai',
        TEPEGOZ_EVAL_API_KEY: 'sk-live',
      });
    });

    it('runs a realUrl scenario verbatim — the live tier is allowed off the fixture server', async () => {
      const { planRun } = await load({ TEPEGOZ_EVAL_MODE: 'live' });
      const target = { realUrl: 'https://example.com/pricing' };
      expect(planRun(scenario('real_site', target), server, work)?.entryUrl).toBe(
        'https://example.com/pricing',
      );
    });

    it('forwards a run ceiling only when one is set — an unset ceiling stays ABSENT, not the string "0"', async () => {
      const off = await load({ TEPEGOZ_EVAL_MODE: 'live', TEPEGOZ_EVAL_RUN_CEILING: '0' });
      expect(
        off.planRun(scenario('a'), server, work)?.env.TEPEGOZ_EVAL_RUN_CEILING,
      ).toBeUndefined();

      const on = await load({ TEPEGOZ_EVAL_MODE: 'live', TEPEGOZ_EVAL_RUN_CEILING: '120000' });
      expect(on.planRun(scenario('a'), server, work)?.env.TEPEGOZ_EVAL_RUN_CEILING).toBe('120000');
    });
  });
});

/**
 * `judgeComplete` builds the driver-side grader — a model call INDEPENDENT of the agent under test. The
 * case that matters most is the one where no judge can be built: it must return a hard-coded FAILING
 * verdict rather than throw or, worse, pass. A judge that cannot run must not grade anything as correct.
 */
describe('judgeComplete', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    vi.restoreAllMocks();
    vi.doUnmock('@tepegoz/model-gateway');
  });

  async function load(env: Record<string, string | undefined>) {
    vi.resetModules();
    for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
    return import('./harness-run');
  }

  const messages = { system: 'grade this', user: 'evidence' };

  it('fails closed with a zero-confidence verdict when no API key is configured', async () => {
    const { judgeComplete } = await load({
      TEPEGOZ_EVAL_PROVIDER: 'anthropic',
      TEPEGOZ_EVAL_API_KEY: '',
    });
    const verdict = JSON.parse(await judgeComplete()(messages)) as {
      pass: boolean;
      confidence: number;
      reason: string;
    };
    expect(verdict.pass).toBe(false);
    expect(verdict.confidence).toBe(0);
    expect(verdict.reason).toContain('no judge model configured');
  });

  it('fails closed when the provider id is not one the gateway can actually run', async () => {
    const { judgeComplete } = await load({
      TEPEGOZ_EVAL_PROVIDER: 'not-a-provider',
      TEPEGOZ_EVAL_API_KEY: 'sk-test',
    });
    const verdict = JSON.parse(await judgeComplete()(messages)) as { pass: boolean };
    expect(verdict.pass).toBe(false);
  });

  it.each(['anthropic', 'openai', 'gemini', 'kimi', 'nova', 'deepseek', 'xai', 'groq'])(
    'builds a %s judge that classifies with a bounded, JSON-formatted call',
    async (provider) => {
      const complete = vi.fn().mockResolvedValue({ text: '{"pass":true}' });
      vi.doMock('@tepegoz/model-gateway', async () => {
        const actual =
          await vi.importActual<typeof import('@tepegoz/model-gateway')>('@tepegoz/model-gateway');
        class StubProvider {
          complete = complete;
        }
        return {
          ...actual,
          AnthropicProvider: StubProvider,
          OpenAIProvider: StubProvider,
          GeminiProvider: StubProvider,
          KimiProvider: StubProvider,
          NovaProvider: StubProvider,
          DeepSeekProvider: StubProvider,
          XaiProvider: StubProvider,
          GroqProvider: StubProvider,
        };
      });
      const { judgeComplete } = await load({
        TEPEGOZ_EVAL_PROVIDER: provider,
        TEPEGOZ_EVAL_API_KEY: 'sk-test',
      });

      expect(await judgeComplete()(messages)).toBe('{"pass":true}');

      const call = complete.mock.calls[0] ?? [];
      const req = call[0] as {
        provider: string;
        capability: string;
        model: string;
        maxTokens: number;
        timeoutMs: number;
        responseFormat: string;
        messages: { role: string; content: string }[];
      };
      expect(req.provider).toBe(provider);
      expect(req.capability).toBe('classify');
      expect(req.model.length).toBeGreaterThan(0);
      expect(req.maxTokens).toBe(512);
      expect(req.timeoutMs).toBe(60_000);
      expect(req.responseFormat).toBe('json');
      expect(req.messages).toEqual([
        { role: 'system', content: 'grade this' },
        { role: 'user', content: 'evidence' },
      ]);
      // Every call is abortable — the harness must be able to stop a judge that hangs.
      expect(call[1]).toBeInstanceOf(AbortSignal);
    },
  );
});
