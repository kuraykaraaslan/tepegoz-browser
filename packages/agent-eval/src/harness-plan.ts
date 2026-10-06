import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { EvalScenario } from '@tepegoz/shared-types';
import { fixtureUrl, type FixtureServer } from './fixture-server';
import { CHAT_SCRIPTS, SCRIPTS } from './harness-scripts';
import { chatFixtureFile } from './chat-fixture';
import { API_KEY, MODE, PROVIDER_ID, RUN_CEILING, chatFixturesDir } from './harness-config';

/** The page the agent starts on + the app env for one scenario. Returns null when the scenario can't run
 *  in this tier (scripted tier + no scripted sequence, or a realUrl target off the live tier). */
export function planRun(
  scenario: EvalScenario,
  server: FixtureServer,
  work: string,
): { entryUrl: string; env: Record<string, string> } | null {
  // A `chatFixture` scenario (X-chat.6) is not a page — `chat-service.electron.ts` seeds `ChatStore`
  // from the named fixture and runs the agent's `chat_*` tools against a `ChatCapabilityHost` bound to
  // a harmless no-op adapter (no socket ever opens). `entryUrl` is a synthetic, never-navigated marker
  // (kept only because `runOne`/`tripEscaped` always take one) — the app-side hook skips navigation
  // entirely once `TEPEGOZ_EVAL_CHAT_FIXTURE` is set.
  if ('chatFixture' in scenario.target) {
    const name = scenario.target.chatFixture;
    const fixturePath = join(chatFixturesDir, chatFixtureFile(name));
    if (!existsSync(fixturePath)) return null;
    const entryUrl = `chat://eval/${name}`;
    if (MODE === 'scripted') {
      const script = CHAT_SCRIPTS[scenario.id];
      if (script === undefined) return null;
      const scriptPath = join(work, `${scenario.id}.script.json`);
      writeFileSync(
        scriptPath,
        JSON.stringify({ provider: 'anthropic', replies: script() }),
        'utf8',
      );
      return {
        entryUrl,
        env: {
          TEPEGOZ_EVAL_MODE: 'scripted',
          TEPEGOZ_EVAL_SCRIPT: scriptPath,
          TEPEGOZ_EVAL_CHAT_FIXTURE: fixturePath,
        },
      };
    }
    // live
    return {
      entryUrl,
      env: {
        TEPEGOZ_EVAL_MODE: 'live',
        TEPEGOZ_EVAL_PROVIDER: PROVIDER_ID,
        TEPEGOZ_EVAL_API_KEY: API_KEY,
        TEPEGOZ_EVAL_CHAT_FIXTURE: fixturePath,
        ...(RUN_CEILING > 0 ? { TEPEGOZ_EVAL_RUN_CEILING: String(RUN_CEILING) } : {}),
      },
    };
  }

  if (MODE === 'scripted') {
    const script = SCRIPTS[scenario.id];
    if (script === undefined || !('fixture' in scenario.target)) return null;
    const { entryUrl, replies } = script(fixtureUrl(server.url, scenario.target.fixture));
    const scriptPath = join(work, `${scenario.id}.script.json`);
    writeFileSync(scriptPath, JSON.stringify({ provider: 'anthropic', replies }), 'utf8');
    return { entryUrl, env: { TEPEGOZ_EVAL_MODE: 'scripted', TEPEGOZ_EVAL_SCRIPT: scriptPath } };
  }
  // live
  const entryUrl =
    'fixture' in scenario.target
      ? `${fixtureUrl(server.url, scenario.target.fixture)}index.html`
      : scenario.target.realUrl;
  return {
    entryUrl,
    env: {
      TEPEGOZ_EVAL_MODE: 'live',
      TEPEGOZ_EVAL_PROVIDER: PROVIDER_ID,
      TEPEGOZ_EVAL_API_KEY: API_KEY,
      // Only forwarded when set, so an unset ceiling stays absent rather than arriving as the string
      // "0" that the app then has to interpret.
      ...(RUN_CEILING > 0 ? { TEPEGOZ_EVAL_RUN_CEILING: String(RUN_CEILING) } : {}),
    },
  };
}
