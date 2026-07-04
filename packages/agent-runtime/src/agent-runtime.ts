import { AppError } from '@tepegoz/libs';
import {
  AnthropicProvider,
  ModelGateway,
  ModelRouter,
  OpenAIProvider,
  TokenLedger,
  type EffortLevel,
  type ModelProvider,
} from '@tepegoz/model-gateway';
import {
  CapabilityRegistry,
  ToolGateway,
  type ConfirmRequest,
  type InvokeContext,
} from '@tepegoz/capability-plane';
import { Planner, Reactor, type StepOutcome } from '@tepegoz/orchestrator';
import { TaintTracker, detectHandoff } from '@tepegoz/security-policy';
import {
  isRunnableProvider,
  RUNNABLE_AI_PROVIDERS,
  type AIProvider,
  type Plan,
} from '@tepegoz/shared-types';
import type { AgentEventKind } from '@tepegoz/ext-agent/types';
import CredentialVault from '@tepegoz/credential-vault';
import PreferenceStore from '@tepegoz/preferences';
import { registerBuiltinTools, type BrowserHost, type JournalReader } from '@tepegoz/browser-tools';

/** Best-effort URL string from a tool call's args (for the sensitive-site lockout). */
function urlFromArgs(args: unknown): string | undefined {
  if (args !== null && typeof args === 'object' && 'url' in args) {
    const url = (args as { url?: unknown }).url;
    if (typeof url === 'string' && url.length > 0) return url;
  }
  return undefined;
}

/** The sanitized page text a read tool returned, so it can be recorded as untrusted (taint). */
function contentFromResult(result: unknown): string | undefined {
  if (result !== null && typeof result === 'object' && 'content' in result) {
    const content = (result as { content?: unknown }).content;
    if (typeof content === 'string' && content.length > 0) return content;
  }
  return undefined;
}

/** The url a read tool's result reports (perception snapshot), for handoff/URL-aware checks. */
function urlFromResult(result: unknown): string | undefined {
  if (result !== null && typeof result === 'object' && 'url' in result) {
    const url = (result as { url?: unknown }).url;
    if (typeof url === 'string' && url.length > 0) return url;
  }
  return undefined;
}

export interface PlanApprovalDecision {
  approved: boolean;
  /** Step ids the user chose to skip (editable plan preview). */
  skipStepIds?: string[];
}

export interface AgentRunHooks {
  onEvent: (kind: AgentEventKind, message: string, detail?: string) => void;
  /** HITL before the loop: user reviews/edits the plan; resolve approved=false to abort. */
  requestPlanApproval: (plan: Plan) => Promise<PlanApprovalDecision>;
  /** HITL: resolve true to allow a gated tool call, false to deny. */
  requestApproval: (req: ConfirmRequest) => Promise<boolean>;
  /** Cooperative cancellation, checked between steps. */
  signal: { readonly aborted: boolean };
}

/**
 * Host-injected seams so the runtime stays Electron- and app-free: the browser tool implementation,
 * the journal reader, a live "active tab URL" reader (Policy Kernel site context), and the localized
 * human-handoff copy (the only user-facing strings the runtime emits that must be localized).
 */
export interface AgentRunDeps {
  browserHost: BrowserHost;
  journal: JournalReader;
  activeTabUrl: () => string | undefined;
  handoffStrings: { captcha: string; twofa: string };
}

export interface AgentRunSummary {
  stoppedReason: string;
  ok: boolean;
}

/**
 * L3 orchestration entry point (Phase 1a end-to-end): user prompt → ModelRouter → Planner (DAG) →
 * sequential Executor through the single ToolGateway PEP (Policy Kernel + HITL) → live Agent Console
 * events. The provider is registered from the safeStorage vault key at run time; the raw key never
 * leaves the process. Provider-agnostic by design; Anthropic + OpenAI adapters ship today (see
 * RUNNABLE_AI_PROVIDERS). Electron-free: every app/OS concern is injected via {@link AgentRunDeps}.
 */
/**
 * Build the model-provider adapter for a resolved provider id. `effort` is applied only by the
 * Anthropic adapter (its `output_config.effort`); the OpenAI tier models are plain chat models that
 * take no effort field, so it is ignored there (see {@link OpenAIProvider}).
 */
function providerFor(provider: AIProvider, apiKey: string, effort: EffortLevel): ModelProvider {
  if (provider === 'openai') {
    return new OpenAIProvider({ apiKey });
  }
  return new AnthropicProvider({ apiKey, effort });
}

export async function runAgent(
  prompt: string,
  hooks: AgentRunHooks,
  deps: AgentRunDeps,
): Promise<AgentRunSummary> {
  const prefs = PreferenceStore.getAll();
  // A key for ANY provider can be stored, but a run resolves to the highest-priority stored key whose
  // provider the runtime has an adapter for — so a user whose top key is a not-yet-wired provider
  // still runs on a lower-priority supported key instead of hard-failing.
  const storedKeys = CredentialVault.listMeta();
  const runnable = storedKeys.find((m) => isRunnableProvider(m.provider));
  if (runnable === undefined) {
    if (storedKeys.length === 0) {
      throw new AppError('No API key configured. Add one in Settings → Providers.', 401);
    }
    throw new AppError(
      `No usable API key: this build can run ${RUNNABLE_AI_PROVIDERS.join(', ')}. ` +
        `Add a key for one of these in Settings → Providers.`,
      501,
    );
  }
  // Use that provider's highest-priority key. The raw key stays in main (getFirstKeyForProvider is
  // main-only), never on IPC.
  const provider = runnable.provider;
  const apiKey = CredentialVault.getFirstKeyForProvider(provider);
  if (apiKey === null) {
    throw new AppError('No API key configured. Add one in Settings → Providers.', 401);
  }

  const route = ModelRouter.route({
    capability: 'plan',
    costSaver: prefs.useLocalModelForSimpleTasks,
    provider,
  });
  // The reactive loop runs on the exec tier (cheaper/faster than the planning tier).
  const execRoute = ModelRouter.route({
    capability: 'exec',
    costSaver: prefs.useLocalModelForSimpleTasks,
    provider,
  });
  ModelGateway.register(providerFor(provider, apiKey, route.effort));

  registerBuiltinTools(deps.browserHost, deps.journal);
  const tools = CapabilityRegistry.list().map((d) => ({
    id: d.id,
    description: d.description,
    dangerClass: d.dangerClass,
  }));

  hooks.onEvent('plan', 'Planning…');
  const plan = await Planner.plan({
    intent: prompt,
    tools,
    provider: route.provider,
    model: route.model,
  });
  hooks.onEvent(
    'plan',
    `Plan ready: ${String(plan.steps.length)} step(s)`,
    plan.steps.map((s) => s.tool).join(' → '),
  );

  // A cancel during planning must abort before we prompt for plan approval.
  if (hooks.signal.aborted) {
    hooks.onEvent('done', 'Cancelled.');
    return { stoppedReason: 'aborted', ok: false };
  }

  // HITL before the loop: the user reviews (and may prune) the plan before ANYTHING runs.
  const decision = await hooks.requestPlanApproval(plan);
  if (!decision.approved) {
    hooks.onEvent('done', 'Plan rejected — nothing was executed.');
    return { stoppedReason: 'plan_rejected', ok: false };
  }
  const skip = new Set(decision.skipStepIds ?? []);
  const steps = plan.steps.filter((s) => !skip.has(s.id));
  if (steps.length === 0) {
    hooks.onEvent('done', 'All steps skipped — nothing to run.');
    return { stoppedReason: 'plan_empty', ok: false };
  }
  const approvedPlan: Plan = { goal: plan.goal, steps };

  // Taint corpus for THIS run: web/model text the agent perceives becomes untrusted, so any later
  // side-effecting arg that lifts it escalates to HITL (Policy Kernel `taintedArgs`).
  const taint = new TaintTracker();

  ToolGateway.setConfirmHandler(hooks.requestApproval);
  ToolGateway.setAuditHandler((entry) => {
    hooks.onEvent('step_start', `${entry.toolName}: ${entry.decision}`, entry.reason);
  });

  // The approved plan becomes GUIDANCE for the reactive loop (not a rigid script): its steps are a
  // suggested outline and the pruned steps are things to avoid. Execution is reactive — the model
  // sees each page (via browser_get_elements) and picks the next action, so it can target live
  // element refs and recover from a failed step. Static Executor.run stays for deterministic replays.
  const outline = approvedPlan.steps.map((s) => `- ${s.tool}: ${s.rationale}`);
  const avoid = plan.steps.filter((s) => skip.has(s.id)).map((s) => s.rationale || s.tool);

  try {
    const result = await Reactor.run(
      {
        goal: approvedPlan.goal.length > 0 ? approvedPlan.goal : prompt,
        outline,
        avoid,
        tools,
        provider: execRoute.provider,
        model: execRoute.model,
      },
      {
        signal: hooks.signal,
        // The Policy Kernel gets the concrete site + taint of EACH tool call here (this is what
        // makes the sensitive-site lockout and taint→HITL actually fire at runtime).
        ctxFor: (_tool, args): InvokeContext => {
          const targetUrl = urlFromArgs(args) ?? deps.activeTabUrl();
          const ctx: InvokeContext = { taintedArgs: taint.isTainted(args) };
          if (targetUrl !== undefined) ctx.targetUrl = targetUrl;
          return ctx;
        },
        onOutcome: (o: StepOutcome) => {
          if (o.ok) {
            // Record perceived page text as untrusted for subsequent steps' taint checks.
            const content = contentFromResult(o.result);
            if (content !== undefined) taint.record(content);
            hooks.onEvent('step_ok', `${o.tool} ✓`);
          } else {
            hooks.onEvent('step_error', `${o.tool} ✗`, o.error?.message ?? 'failed');
          }
        },
        // Human Handoff Controller: a CAPTCHA/2FA in a perceived page halts the loop and hands
        // control back to the user — deterministic, NO auto-solve, credit preserved.
        guard: (o: StepOutcome) => {
          const content = contentFromResult(o.result);
          if (content === undefined) return null;
          const signal = detectHandoff(content, urlFromResult(o.result));
          if (signal === null) return null;
          hooks.onEvent(
            'handoff',
            signal.kind === 'captcha' ? deps.handoffStrings.captcha : deps.handoffStrings.twofa,
          );
          return 'handoff';
        },
      },
    );
    if (result.stoppedReason === 'handoff') {
      // The 'handoff' event above is the terminal, user-facing message — no generic "Finished" line.
      return { stoppedReason: 'handoff', ok: false };
    }
    const usage = TokenLedger.totals();
    hooks.onEvent(
      'done',
      result.summary !== undefined && result.summary.length > 0
        ? result.summary
        : `Finished: ${result.stoppedReason}`,
      `${String(usage.totalTokens)} tokens`,
    );
    return { stoppedReason: result.stoppedReason, ok: result.stoppedReason === 'completed' };
  } finally {
    ToolGateway.setConfirmHandler(null);
    ToolGateway.setAuditHandler(null);
  }
}
