import { readFileSync, writeFileSync } from 'node:fs';
import { app } from 'electron';
import { z } from 'zod';
import { Logger } from '@tepegoz/libs';
import { setStrictMode } from '@tepegoz/tool-executor';
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
import { discoverSitemap } from '../web/web-tools-host.electron';
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

/**
 * Navigate to the scenario's entry page through the REAL navigation path, retrying while the app still
 * has no drivable tab.
 *
 * This bootstrap runs from `whenReady` BEFORE the window's first tab exists, and a clean profile has no
 * session to restore — so `navigate` throws `No active page` for the first moment of a run. It was
 * invisible until trials got isolated profiles, because every trial silently inherited the PREVIOUS
 * trial's restored tab; the first trial of a batch passed and the rest died, which is exactly the
 * pattern that made repeat runs meaningless.
 */
async function navigateWhenReady(url: string, timeoutMs = 30_000): Promise<void> {
  const origin = new URL(url).origin;
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      // A brand-new profile opens with NO tab at all, and `navigateActive` returns early when there is no
      // active tab record — so the agent would sit out the whole timeout on "No active page". Open the
      // entry tab the way the UI does, then wait for THAT load. Calling `navigate` as well would start a
      // second load on the same tab and abort the first (`ERR_ABORTED`), leaving the page in a state
      // where the next tool call blocked for minutes. (Whether a first-run window SHOULD come up
      // tab-less is a separate product question this does not answer.)
      if (TabManager.activeWebContents() === null && TabManager.createTab(url) !== null) {
        await browserHost.waitForLoad();
      } else {
        await browserHost.navigate(url);
      }
      // Readiness BARRIER — not merely "the navigation call returned". A cold launch under sustained batch
      // load races app startup (fresh profile + first paint + first navigation), so the load can resolve on
      // an ABORTED/blank page (ERR_FAILED, a popup/tab load race, "No active page"). The agent then starts
      // on nothing and its whole trip is scored as a phantom wrong answer — the dominant transport flake
      // that quietly deflated every sweep. Confirm the fixture ORIGIN actually loaded WITH real body text
      // before handing off; otherwise keep retrying within the deadline so the cold trial self-heals rather
      // than poisoning the measurement. (The harness's transport-invalid retry is the backstop for the rest.)
      const page = await browserHost.readPage();
      if (page.url.startsWith(origin) && page.text.trim().length > 0) return;
      throw new Error(`entry page not ready (url=${page.url}, textLen=${String(page.text.trim().length)})`);
    } catch (err) {
      if (Date.now() >= deadline) throw err;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
}

export async function maybeRunEval(): Promise<void> {
  if (process.env.TEPEGOZ_EVAL !== '1') return;

  // C7 harness knob: force the hardened inbound strict guard ON for this eval run (measure the
  // strict-mode ASR). Off by default, exactly like a real user without the Setting enabled.
  if (process.env.TEPEGOZ_EVAL_STRICT === '1') {
    setStrictMode(true);
    Logger.info('[eval] strict inbound-guard mode ON (TEPEGOZ_EVAL_STRICT=1)');
  }

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
    await navigateWhenReady(fixtureUrl);

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
      discoverSitemap,
      handoffStrings: { captcha: handoff.captcha, twofa: handoff.twofa, login: handoff.login },
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
          // S4: what the evidence supported, so the harness can separate "could not confirm" from "failed".
          ...(summary.completionOutcome !== undefined
            ? { completionOutcome: summary.completionOutcome }
            : {}),
          finalUrl: page.url,
          finalPageText: page.text,
          // AI-1 observability: real per-step outcomes + token usage from the run, so the harness scores
          // honest toolCalls/toolErrors/cost instead of the previous hard-coded zeros.
          steps: summary.steps ?? [],
          tokenUsage: summary.tokenUsage ?? { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
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
