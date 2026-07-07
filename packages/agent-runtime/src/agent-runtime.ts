import { AppError } from '@tepegoz/libs';
import {
  AnthropicProvider,
  GeminiProvider,
  ModelGateway,
  ModelRouter,
  OpenAIProvider,
  TokenLedger,
  type CanonMessage,
  type EffortLevel,
  type ModelProvider,
} from '@tepegoz/model-gateway';
import {
  CapabilityRegistry,
  ToolGateway,
  type ConfirmRequest,
  type InvokeContext,
} from '@tepegoz/capability-plane';
import { Planner, Reactor, type AgentFailure, type StepOutcome } from '@tepegoz/orchestrator';
import { TaintTracker, detectHandoff, inspectEgress } from '@tepegoz/security-policy';
import {
  isRunnableProvider,
  RUNNABLE_AI_PROVIDERS,
  type AIProvider,
  type Plan,
} from '@tepegoz/shared-types';
import type { AgentEventKind } from '@tepegoz/ext-agent/types';
import CredentialVault from '@tepegoz/credential-vault';
import PreferenceStore from '@tepegoz/preferences';
import { LocalProvider, type LocalProviderConfig } from '@tepegoz/local-inference';
import {
  advanceRunPhase,
  checkpointForDecision,
  checkpointForPlan,
  checkpointFromOutcome,
  terminalCheckpoint,
  type AgentRunCheckpoint,
  type AgentRunPhase,
} from './run-lifecycle';

/** The reasoning-effort preset (Agent panel) maps to a per-call max output-token budget: higher effort
 *  allows longer reasoning/summaries. Kept within Claude 4.x output limits. Applied to both the planning
 *  and the reactive-execution calls; the Anthropic adapter also receives the matching `output_config.effort`. */
const EFFORT_MAX_TOKENS: Record<EffortLevel, number> = {
  low: 2048,
  medium: 4096,
  high: 8192,
  xhigh: 16384,
  max: 32768,
};

/** Best-effort URL string from a tool call's args (for the sensitive-site lockout). */
function urlFromArgs(args: unknown): string | undefined {
  if (args !== null && typeof args === 'object' && 'url' in args) {
    const url = (args as { url?: unknown }).url;
    if (typeof url === 'string' && url.length > 0) return url;
  }
  return undefined;
}

/** Best-effort tab id string from a tool call's args, for tab-scoped policy context. */
function tabIdFromArgs(args: unknown): string | undefined {
  if (args !== null && typeof args === 'object' && 'tabId' in args) {
    const tabId = (args as { tabId?: unknown }).tabId;
    if (typeof tabId === 'string' && tabId.length > 0) return tabId;
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
  /** Durable checkpoint seam: hosts may project this into the Event Journal for resume/replay. */
  onCheckpoint?: (checkpoint: AgentRunCheckpoint) => void;
  /** HITL before the loop: user reviews/edits the plan; resolve approved=false to abort. */
  requestPlanApproval: (plan: Plan) => Promise<PlanApprovalDecision>;
  /** HITL: resolve true to allow a gated tool call, false to deny. */
  requestApproval: (req: ConfirmRequest) => Promise<boolean>;
  /** Cooperative cancellation, checked between steps. */
  signal: { readonly aborted: boolean };
}

/**
 * Host-injected seams so the runtime stays Electron- and app-free: a live "active tab URL" reader
 * (Policy Kernel site context) and the localized human-handoff copy (the only user-facing strings the
 * runtime emits that must be localized). The agent's built-in tools (and their concrete browser/journal
 * host) are registered separately at app startup via `ExtensionCapabilityService` (ADR-0021/0024), so
 * they are NOT passed here — this runtime just enumerates the single `CapabilityRegistry`.
 */
export interface AgentRunDeps {
  activeTabUrl: () => string | undefined;
  /** Resolve a browser tab's committed URL for tabId-scoped browser tools. */
  tabUrl?: (tabId: string) => string | undefined;
  handoffStrings: { captcha: string; twofa: string };
  /**
   * On-device inference config (engine + selected-model resolver). Injected by the Electron wiring;
   * absent when the app didn't wire a local engine, in which case `'local'` routing is unavailable and
   * the run falls back to a cloud provider. Keeps this package Electron-free.
   */
  localInference?: LocalProviderConfig;
  /**
   * Token budget seam (L7): the account-wide total-token quota + the persisted lifetime usage (from
   * the SQLite Token Ledger). Seeds the in-memory ledger AFTER its per-run reset so the live quota
   * indicator + 80% warning reflect CUMULATIVE spend, not just this run. Absent → no quota (unlimited).
   * The host owns persistence + the pre-flight block + auto-refund; this only feeds the live status.
   */
  tokenBudget?: { quota: number; lifetimeUsed: number };
}

export interface AgentRunSummary {
  stoppedReason: string;
  ok: boolean;
  checkpoint?: AgentRunCheckpoint | undefined;
  /** The agent's closing summary for this turn — appended to the conversation memory by the host. */
  summary?: string;
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
/**
 * Resolve which provider serves the run, in priority order: (1) an explicit per-run override from the
 * Agent panel, when usable; (2) whole-agent-local (`mode:'default'`) when a model is available; (3) the
 * highest-priority stored key whose provider has an adapter. Throws {@link AppError} when none is usable.
 */
function resolveProvider(
  override: AIProvider | null,
  mode: 'off' | 'simple' | 'default',
  localAvailable: boolean,
): { provider: AIProvider; apiKey: string } {
  // 1) Explicit per-run override — honored ONLY when actually usable (local needs a model; a cloud
  //    provider needs a stored key). An unusable override is ignored and we fall through.
  if (override === 'local' && localAvailable) {
    return { provider: 'local', apiKey: '' };
  }
  if (override !== null && override !== 'local' && isRunnableProvider(override)) {
    const overrideKey = CredentialVault.getFirstKeyForProvider(override);
    if (overrideKey !== null) return { provider: override, apiKey: overrideKey };
  }
  // 2) Whole-agent-local.
  if (mode === 'default' && localAvailable) {
    return { provider: 'local', apiKey: '' };
  }
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
  // The raw key stays in main (getFirstKeyForProvider is main-only), never on IPC.
  const apiKey = CredentialVault.getFirstKeyForProvider(runnable.provider);
  if (apiKey === null) {
    throw new AppError('No API key configured. Add one in Settings → Providers.', 401);
  }
  return { provider: runnable.provider, apiKey };
}

function providerFor(
  provider: AIProvider,
  apiKey: string,
  effort: EffortLevel,
  localConfig: LocalProviderConfig | undefined,
): ModelProvider {
  if (provider === 'local') {
    if (localConfig === undefined) {
      throw new AppError('On-device inference is not available on this machine.', 503);
    }
    return new LocalProvider(localConfig);
  }
  if (provider === 'openai') {
    return new OpenAIProvider({ apiKey });
  }
  if (provider === 'gemini') {
    return new GeminiProvider({ apiKey });
  }
  return new AnthropicProvider({ apiKey, effort });
}

export async function runAgent(
  prompt: string,
  hooks: AgentRunHooks,
  deps: AgentRunDeps,
  /** Prior conversation turns (earlier prompts + summaries) so the agent has context for follow-ups. */
  history: readonly CanonMessage[] = [],
): Promise<AgentRunSummary> {
  let phase: AgentRunPhase = 'requested';
  let lastCheckpoint: AgentRunCheckpoint | undefined;
  const emitCheckpoint = (checkpoint: AgentRunCheckpoint): void => {
    lastCheckpoint = checkpoint;
    hooks.onCheckpoint?.(checkpoint);
  };
  const transition = (event: Parameters<typeof advanceRunPhase>[1]): AgentRunPhase => {
    phase = advanceRunPhase(phase, event);
    return phase;
  };

  const prefs = PreferenceStore.getAll();
  // Per-task token counter: the ledger is a process-global static, so clear it at the START of each run
  // — otherwise the panel's counter shows session-cumulative tokens ("keeps climbing").
  TokenLedger.reset();
  // Seed the quota + persisted lifetime AFTER the reset, so the live budgetStatus (quota indicator +
  // 80% warning) is computed against cumulative account usage. Off (0) → unlimited.
  if (deps.tokenBudget !== undefined) {
    TokenLedger.setQuota(deps.tokenBudget.quota);
    TokenLedger.setBaseline(deps.tokenBudget.lifetimeUsed);
  }

  // Egress Firewall (L8) over the single ModelGateway chokepoint: EVERY outbound model request (the
  // Planner + every reactive turn, which accumulate perceived/tainted page text) is inspected before it
  // leaves the device. A hard secret/key leak is BLOCKED (throws → the run aborts before the provider is
  // called, so no secret is sent and no tokens are spent); PII/encoded-blob warnings are surfaced to the
  // Console. Set per run so the warn handler targets THIS run's stream — the gateway is only ever called
  // by the Planner/Reactor inside this run. The inspector itself is stateless (safe to leave installed).
  ModelGateway.setEgressInspector(inspectEgress, (findings) => {
    const summary = findings.map((f) => `${f.kind} (${f.sample})`).join(', ');
    hooks.onEvent('decision', 'Egress warning: possible PII/encoded data in the model request', summary);
  });

  // On-device availability: a native backend AND a selected/installed model. Drives both the
  // whole-agent-local path below and the router's per-capability `local` offload.
  const localAvailable =
    deps.localInference?.engine.isAvailable() === true &&
    deps.localInference.resolveModel() !== null;

  // Resolve the provider: per-run override (panel selector) → whole-agent-local → highest-priority key.
  const { provider, apiKey } = resolveProvider(
    prefs.agentProviderOverride,
    prefs.localProvider.mode,
    localAvailable,
  );

  // Cost-saver is on when either the public toggle is set or the local provider is enabled at all.
  const costSaver = prefs.useLocalModelForSimpleTasks || prefs.localProvider.mode !== 'off';

  // Per-run reasoning effort (Agent panel): overrides the router's tier effort and sets the token budget.
  const effort = prefs.agentEffort;
  const maxTokens = EFFORT_MAX_TOKENS[effort];

  const route = ModelRouter.route({ capability: 'plan', costSaver, localAvailable, provider });
  // The reactive loop runs on the exec tier (cheaper/faster than the planning tier).
  const execRoute = ModelRouter.route({ capability: 'exec', costSaver, localAvailable, provider });
  ModelGateway.register(providerFor(provider, apiKey, effort, deps.localInference));
  // Also register the on-device provider when a model is available, so a simple-capability local
  // offload (router `transport:'local'` → `provider:'local'`) resolves even while the main run is on a
  // cloud provider. Harmless duplicate when the main provider already IS local.
  if (provider !== 'local' && localAvailable && deps.localInference !== undefined) {
    ModelGateway.register(new LocalProvider(deps.localInference));
  }

  // The agent's built-in tools are registered at startup by the app's ExtensionCapabilityService
  // (gated on `com.tepegoz.agent` being enabled, ADR-0021/0024) — this runtime just enumerates
  // whatever the single CapabilityRegistry currently holds, so a disabled agent has no tools.
  const tools = CapabilityRegistry.list().map((d) => ({
    id: d.id,
    description: d.description,
    dangerClass: d.dangerClass,
  }));

  transition('start_planning');
  hooks.onEvent('plan', 'Planning…');
  const plan = await Planner.plan({
    intent: prompt,
    tools,
    provider: route.provider,
    model: route.model,
    maxTokens,
    history,
  });
  hooks.onEvent(
    'plan',
    `Plan ready: ${String(plan.steps.length)} step(s)`,
    plan.steps.map((s) => s.tool).join(' → '),
  );
  emitCheckpoint(checkpointForPlan(transition('plan_ready'), plan));

  // A cancel during planning must abort before we prompt for plan approval.
  if (hooks.signal.aborted) {
    emitCheckpoint(terminalCheckpoint(transition('cancel'), 'aborted'));
    hooks.onEvent('done', 'Cancelled.');
    return { stoppedReason: 'aborted', ok: false, checkpoint: lastCheckpoint };
  }

  // HITL before the loop: the user reviews (and may prune) the plan before ANYTHING runs.
  const decision = await hooks.requestPlanApproval(plan);
  if (!decision.approved) {
    emitCheckpoint(
      checkpointForDecision(transition('plan_rejected'), plan, {
        approved: false,
        skippedStepIds: decision.skipStepIds ?? [],
      }),
    );
    hooks.onEvent('done', 'Plan rejected — nothing was executed.');
    return { stoppedReason: 'plan_rejected', ok: false, checkpoint: lastCheckpoint };
  }
  const skip = new Set(decision.skipStepIds ?? []);
  const steps = plan.steps.filter((s) => !skip.has(s.id));
  emitCheckpoint(
    checkpointForDecision(transition('plan_approved'), plan, {
      approved: true,
      skippedStepIds: decision.skipStepIds ?? [],
    }),
  );
  if (steps.length === 0) {
    emitCheckpoint(terminalCheckpoint(transition('complete'), 'plan_empty'));
    hooks.onEvent('done', 'All steps skipped — nothing to run.');
    return { stoppedReason: 'plan_empty', ok: false, checkpoint: lastCheckpoint };
  }
  const approvedPlan: Plan = { goal: plan.goal, steps };
  transition('execution_started');

  // Taint corpus for THIS run: web/model text the agent perceives becomes untrusted, so any later
  // side-effecting arg that lifts it escalates to HITL (Policy Kernel `taintedArgs`).
  const taint = new TaintTracker();

  // The approved plan becomes GUIDANCE for the reactive loop (not a rigid script): its steps are a
  // suggested outline and the pruned steps are things to avoid. Execution is reactive — the model
  // sees each page (via browser_get_elements) and picks the next action, so it can target live
  // element refs and recover from a failed step. Static Executor.run stays for deterministic replays.
  const outline = approvedPlan.steps.map((s) => `- ${s.tool}: ${s.rationale}`);
  const avoid = plan.steps.filter((s) => skip.has(s.id)).map((s) => s.rationale || s.tool);

  const result = await ToolGateway.runWithHandlers(
    {
      confirmHandler: hooks.requestApproval,
      auditHandler: (entry) => {
        hooks.onEvent('step_start', `${entry.toolName}: ${entry.decision}`, entry.reason);
      },
    },
    () => Reactor.run(
      {
        goal: approvedPlan.goal.length > 0 ? approvedPlan.goal : prompt,
        outline,
        avoid,
        tools,
        provider: execRoute.provider,
        model: execRoute.model,
        maxTokens,
        history,
      },
      {
        signal: hooks.signal,
        // Surface each step's decision rationale as a 'decision' event → the panel's Reasoning section.
        onDecision: (tool, rationale) => {
          if (rationale.length > 0) hooks.onEvent('decision', tool, rationale);
        },
        // The Policy Kernel gets the concrete site + taint of EACH tool call here (this is what
        // makes the sensitive-site lockout and taint→HITL actually fire at runtime).
        ctxFor: (tool, args): InvokeContext => {
          const tabId = tabIdFromArgs(args);
          const targetUrl =
            urlFromArgs(args) ??
            (tabId !== undefined ? deps.tabUrl?.(tabId) : undefined) ??
            deps.activeTabUrl();
          const ctx: InvokeContext = { taintedArgs: taint.isTainted(args) };
          if (targetUrl !== undefined) ctx.targetUrl = targetUrl;
          // create/upload-style tools require an idempotency key at the PEP. The agent supplies a fresh
          // one per invocation — the reactor's loop detection and each tool's own guards (e.g.
          // file_create_file's exists→409 check) handle accidental repeats.
          if (CapabilityRegistry.get(tool)?.descriptor.requiresIdempotencyKey === true) {
            ctx.idempotencyKey = globalThis.crypto.randomUUID();
          }
          return ctx;
        },
        onOutcome: (o: StepOutcome) => {
          emitCheckpoint(checkpointFromOutcome(phase, o));
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
    ),
  );
  if (result.stoppedReason === 'handoff') {
    // The 'handoff' event above is the terminal, user-facing message — no generic "Finished" line.
    emitCheckpoint(terminalCheckpoint(transition('pause'), 'handoff'));
    return { stoppedReason: 'handoff', ok: false, checkpoint: lastCheckpoint };
  }
  const failure: AgentFailure | undefined = result.failure;
  const terminalPhase =
    result.stoppedReason === 'completed'
      ? transition('complete')
      : result.stoppedReason === 'aborted'
        ? transition('cancel')
        : transition('fail');
  emitCheckpoint(terminalCheckpoint(terminalPhase, result.stoppedReason, failure));
  const usage = TokenLedger.totals();
  const terminalKind: AgentEventKind =
    result.stoppedReason === 'completed' || result.stoppedReason === 'aborted' ? 'done' : 'error';
  hooks.onEvent(
    terminalKind,
    result.summary !== undefined && result.summary.length > 0
      ? result.summary
      : `Finished: ${result.stoppedReason}`,
    `${String(usage.totalTokens)} tokens`,
  );
  return {
    stoppedReason: result.stoppedReason,
    ok: result.stoppedReason === 'completed',
    checkpoint: lastCheckpoint,
    ...(result.summary !== undefined && result.summary.length > 0
      ? { summary: result.summary }
      : {}),
  };
}
