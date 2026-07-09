import { readFileSync, writeFileSync } from 'node:fs';
import { app } from 'electron';
import { z } from 'zod';
import { Logger } from '@tepegoz/libs';
import { runAgent, type AgentRunHooks } from '@tepegoz/agent-runtime';
import {
  AnthropicProvider,
  GeminiProvider,
  KimiProvider,
  OpenAIProvider,
  ScriptedProvider,
  type ModelProvider,
} from '@tepegoz/model-gateway';
import { isRunnableProvider, type AIProvider } from '@tepegoz/shared-types';
import TabManager from '../tabs';
import { browserHost } from './browser-host.electron';
import { mainStrings } from '../lib/i18n-main';
import { llamaEngine } from '../local-inference/llama-engine.electron';
import ModelManager from '../model-catalog/model-manager.electron';

/**
 * Env-gated batch runner for the AI-1 eval harness — INERT in production (returns immediately unless
 * `TEPEGOZ_EVAL === '1'`). When the harness launches the real app with the eval env set, this drives
 * ONE scenario through the exact production path — real BrowserHost, real ToolGateway/Policy/HITL plane
 * — swapping ONLY the model and auto-approving HITL for the unattended run. It navigates the active tab
 * to the target page, runs the agent, reads the final page through the real read path, writes the result
 * JSON the harness scores, and quits.
 *
 * Two model tiers (both drive the real app):
 *  - `scripted` (default): a {@link ScriptedProvider} replays a canned sequence — deterministic, no key.
 *  - `live`: a REAL cloud provider built from an env key (honest competence). The key comes from the env,
 *    NOT the vault, so the harness controls the model without touching stored credentials.
 *
 * Env contract (all required when `TEPEGOZ_EVAL=1`):
 *  - `TEPEGOZ_EVAL_PROMPT`       the task handed to the agent
 *  - `TEPEGOZ_EVAL_FIXTURE_URL`  the page the agent starts on (a fixture URL or a real URL)
 *  - `TEPEGOZ_EVAL_OUT`          where to write `{ summary, stoppedReason, finalUrl, finalPageText }`
 *  - `TEPEGOZ_EVAL_MODE`         `scripted` (default) | `live`
 *  - scripted → `TEPEGOZ_EVAL_SCRIPT`   path to a `{ provider?, replies: string[] }` JSON
 *  - live     → `TEPEGOZ_EVAL_PROVIDER` (anthropic|openai|gemini) + `TEPEGOZ_EVAL_API_KEY`
 */
const RepliesFileSchema = z.object({
  provider: z.string().optional(),
  replies: z.array(z.string()),
});

/** The active web tab's committed URL (Policy Kernel site context) — mirrors AgentService's seam. */
function activeTabUrl(): string | undefined {
  const state = TabManager.getState();
  const active = state.tabs.find((t) => t.id === state.activeId);
  return active !== undefined && active.url.length > 0 ? active.url : undefined;
}

function tabUrl(tabId: string): string | undefined {
  const tab = TabManager.getState().tabs.find((t) => t.id === tabId);
  return tab !== undefined && tab.url.length > 0 ? tab.url : undefined;
}

/** Build a REAL cloud provider from the eval env key (live tier). Throws with a clear message when the
 *  provider is unknown/unsupported or the key is missing. */
function liveProviderFromEnv(): { id: AIProvider; instance: ModelProvider } {
  const raw = process.env.TEPEGOZ_EVAL_PROVIDER ?? 'anthropic';
  const apiKey = process.env.TEPEGOZ_EVAL_API_KEY;
  if (apiKey === undefined || apiKey.length === 0) {
    throw new Error('live tier needs TEPEGOZ_EVAL_API_KEY');
  }
  if (!isRunnableProvider(raw as AIProvider)) {
    throw new Error(`live tier provider "${raw}" is not runnable`);
  }
  const id = raw as AIProvider;
  let instance: ModelProvider;
  if (id === 'openai') {
    instance = new OpenAIProvider({ apiKey });
  } else if (id === 'gemini') {
    instance = new GeminiProvider({ apiKey });
  } else if (id === 'kimi') {
    instance = new KimiProvider({ apiKey });
  } else {
    instance = new AnthropicProvider({ apiKey });
  }
  return { id, instance };
}

/** Build the injected provider for this run from the eval env (scripted replay or live cloud model). */
function providerForRun(): { id: AIProvider; instance: ModelProvider } {
  if ((process.env.TEPEGOZ_EVAL_MODE ?? 'scripted') === 'live') {
    return liveProviderFromEnv();
  }
  const scriptPath = process.env.TEPEGOZ_EVAL_SCRIPT;
  if (scriptPath === undefined) throw new Error('scripted tier needs TEPEGOZ_EVAL_SCRIPT');
  const parsed = RepliesFileSchema.safeParse(JSON.parse(readFileSync(scriptPath, 'utf8')));
  if (!parsed.success) {
    throw new Error(`invalid replies file: ${parsed.error.issues.map((i) => i.message).join('; ')}`);
  }
  const id = (parsed.data.provider ?? 'anthropic') as AIProvider;
  return { id, instance: new ScriptedProvider(parsed.data.replies, id) };
}

export async function maybeRunEval(): Promise<void> {
  if (process.env.TEPEGOZ_EVAL !== '1') return;

  const prompt = process.env.TEPEGOZ_EVAL_PROMPT;
  const fixtureUrl = process.env.TEPEGOZ_EVAL_FIXTURE_URL;
  const outPath = process.env.TEPEGOZ_EVAL_OUT;
  if (prompt === undefined || fixtureUrl === undefined || outPath === undefined) {
    Logger.error('[eval] TEPEGOZ_EVAL=1 but a required env var is missing', {
      prompt: prompt ?? '',
      fixtureUrl: fixtureUrl ?? '',
      outPath: outPath ?? '',
    });
    app.quit();
    return;
  }

  try {
    const provider = providerForRun();

    // Start the agent on the target page through the REAL navigation path.
    await browserHost.navigate(fixtureUrl);

    const handoff = mainStrings().agent.handoff;
    const hooks: AgentRunHooks = {
      onEvent: (kind, message, detail) => Logger.info(`[eval] ${kind}: ${message}`, { detail: detail ?? '' }),
      // Unattended eval: auto-approve the plan + every HITL gate. Reachable ONLY under TEPEGOZ_EVAL.
      requestPlanApproval: () => Promise.resolve({ approved: true }),
      requestApproval: () => Promise.resolve(true),
      signal: { aborted: false },
    };

    const summary = await runAgent(prompt, hooks, {
      activeTabUrl,
      tabUrl,
      handoffStrings: { captcha: handoff.captcha, twofa: handoff.twofa },
      localInference: { engine: llamaEngine(), resolveModel: () => ModelManager.resolveModel() },
      provider,
    });

    const page = await browserHost.readPage();
    writeFileSync(
      outPath,
      JSON.stringify(
        {
          summary: summary.summary ?? '',
          stoppedReason: summary.stoppedReason,
          finalUrl: page.url,
          finalPageText: page.text,
        },
        null,
        2,
      ),
      'utf8',
    );
    Logger.info('[eval] wrote result', { outPath, stoppedReason: summary.stoppedReason });
  } catch (err) {
    Logger.error('[eval] run failed', { err: String(err) });
    try {
      writeFileSync(outPath, JSON.stringify({ error: String(err) }), 'utf8');
    } catch {
      // best-effort — the harness treats a missing/incomplete OUT file as a hard fail.
    }
  } finally {
    app.quit();
  }
}
