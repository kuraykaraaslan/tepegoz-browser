import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { EvalScenario } from '@tepegoz/shared-types';
import type { FixtureServer } from './fixture-server';

/**
 * `planRun` decides what the app is pointed at and what env it is handed for ONE scenario — the two
 * inputs that determine whether a trial measures anything at all. The rules worth pinning are the
 * REFUSALS (null, so the scenario is skipped and logged rather than silently counted as a failure) and
 * the tier split: the scripted tier writes a replay file and never carries a key, the live tier carries
 * the key and forwards a ceiling only when one is set.
 */
describe('planRun', () => {
  // Warm the transform cache once so the first case does not pay the cold import inside its 5s budget.
  beforeAll(async () => {
    await import('./harness-plan');
  }, 60_000);

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
    return import('./harness-plan');
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

    it('writes the chat replay file and points the app at the fixture, not a page (X-chat.6 slice 3)', async () => {
      const { planRun } = await load({ TEPEGOZ_EVAL_MODE: undefined });
      const target = { chatFixture: 'room-backlog' };
      const plan = planRun(scenario('chat_summarise_room_backlog', target), server, work);
      expect(plan?.entryUrl).toBe('chat://eval/room-backlog');
      expect(plan?.env.TEPEGOZ_EVAL_MODE).toBe('scripted');
      expect(plan?.env.TEPEGOZ_EVAL_CHAT_FIXTURE).toMatch(/room-backlog\.chat\.json$/);
      const scriptPath = plan?.env.TEPEGOZ_EVAL_SCRIPT ?? '';
      expect(scriptPath).toBe(join(work, 'chat_summarise_room_backlog.script.json'));
      const written = JSON.parse(readFileSync(scriptPath, 'utf8')) as { replies: string[] };
      expect(written.replies.length).toBeGreaterThan(1);
    });

    it('refuses (null) a chatFixture scenario with no authored scripted sequence', async () => {
      const { planRun } = await load({ TEPEGOZ_EVAL_MODE: undefined });
      const target = { chatFixture: 'room-backlog' };
      expect(planRun(scenario('chat_no_script_for_this_one', target), server, work)).toBeNull();
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

    it('forwards the provider/key and points a chatFixture target at its seed file (X-chat.6 slice 3)', async () => {
      const { planRun } = await load({
        TEPEGOZ_EVAL_MODE: 'live',
        TEPEGOZ_EVAL_PROVIDER: 'openai',
        TEPEGOZ_EVAL_API_KEY: 'sk-live',
      });
      const target = { chatFixture: 'room-backlog' };
      const plan = planRun(scenario('chat_summarise_room_backlog', target), server, work);
      expect(plan?.entryUrl).toBe('chat://eval/room-backlog');
      expect(plan?.env).toMatchObject({
        TEPEGOZ_EVAL_MODE: 'live',
        TEPEGOZ_EVAL_PROVIDER: 'openai',
        TEPEGOZ_EVAL_API_KEY: 'sk-live',
      });
      expect(plan?.env.TEPEGOZ_EVAL_CHAT_FIXTURE).toMatch(/room-backlog\.chat\.json$/);
    });

    it('refuses (null) a chatFixture target whose seed file does not exist', async () => {
      const { planRun } = await load({ TEPEGOZ_EVAL_MODE: 'live' });
      const target = { chatFixture: 'no-such-fixture' };
      expect(planRun(scenario('chat_ghost', target), server, work)).toBeNull();
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
