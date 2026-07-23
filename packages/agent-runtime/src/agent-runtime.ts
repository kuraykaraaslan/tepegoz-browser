import {
  ModelGateway,
  ModelRouter,
  TokenLedger,
  type CanonMessage,
} from '@tepegoz/model-gateway';
import { CapabilityRegistry } from '@tepegoz/capability-plane';
import { type AgentFailure } from '@tepegoz/orchestrator';
import { inspectEgress } from '@tepegoz/security-policy';
import { type Plan } from '@tepegoz/shared-types';
import type { AgentEventKind } from '@tepegoz/ext-agent/types';
import PreferenceStore from '@tepegoz/preferences';
import {
  advanceRunPhase,
  checkpointForDecision,
  checkpointForPlan,
  terminalCheckpoint,
  type AgentRunCheckpoint,
  type AgentRunPhase,
} from './run-lifecycle';
import { EFFORT_MAX_TOKENS, planOrEgressStop, terminalMessageFor } from './agent-runtime-helpers';
import { hotSwapRunProvider, registerRunProvider } from './agent-runtime-providers';
import { runReactiveLoop } from './agent-runtime-loop';
import type { AgentRunDeps, AgentRunHooks, AgentRunSummary } from './agent-runtime-types';

export { hotSwapRunProvider };
export type {
  PlanApprovalDecision,
  AgentRunHooks,
  AgentRunDeps,
  AgentRunSummary,
} from './agent-runtime-types';

/** The navigation/fetch target of a tool call (its `url` arg), surfaced per-step so the AI-7 eval can
 *  measure the escape rate (off-origin nav). `undefined` for tools with no URL arg (most). */
function navTargetOf(args: unknown): string | undefined {
  if (args !== null && typeof args === 'object' && 'url' in args) {
    const url = (args as { url?: unknown }).url;
    if (typeof url === 'string' && url.length > 0) return url;
  }
  return undefined;
}

/**
 * L3 orchestration entry point (Phase 1a end-to-end): user prompt → ModelRouter → Planner (DAG) →
 * sequential Executor through the single ToolGateway PEP (Policy Kernel + HITL) → live Agent Console
 * events. The provider is registered from the safeStorage vault key at run time; the raw key never
 * leaves the process. Provider-agnostic by design; Anthropic + OpenAI adapters ship today (see
 * RUNNABLE_AI_PROVIDERS). Electron-free: every app/OS concern is injected via {@link AgentRunDeps}.
 */
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
  ModelGateway.setEgressInspector(inspectEgress, {
    // Advisory (PII / encoded blob): surface to the Console, still send.
    onWarn: (findings) => {
      const summary = findings.map((f) => `${f.kind} (${f.sample})`).join(', ');
      hooks.onEvent('decision', 'Egress warning: possible PII/encoded data in the model request', summary);
    },
    // Possible secret (block-severity): route to HITL — the user chooses to send or cancel (origin-blind
    // detection can't tell a real secret from token-shaped page content it was asked to read, so a hard
    // abort would kill legitimate runs). Cancel → the gateway throws → the run stops 'egress_blocked'.
    confirmBlock: (findings) => {
      const kinds = [...new Set(findings.map((f) => f.kind))].join(', ');
      return hooks.requestApproval({
        toolName: 'model_send',
        policy: { decision: 'ask', reason: `egress_possible_secret:${kinds}`, biometric: false },
        args: { flagged: findings.map((f) => `${f.kind}: ${f.sample}`) },
      });
    },
  });

  // On-device availability: a native backend AND a selected/installed model. Drives both the
  // whole-agent-local path below and the router's per-capability `local` offload.
  const localAvailable =
    deps.localInference?.engine.isAvailable() === true &&
    deps.localInference.resolveModel() !== null;

  // Per-run reasoning effort (Agent panel): overrides the router's tier effort and sets the token budget.
  const effort = prefs.agentEffort;
  const maxTokens = EFFORT_MAX_TOKENS[effort];
  // Cost-saver is on when either the public toggle is set or the local provider is enabled at all.
  const costSaver = prefs.useLocalModelForSimpleTasks || prefs.localProvider.mode !== 'off';

  // Resolve + register the provider (eval seam → vault/prefs) and get the id that drives routing.
  const provider = registerRunProvider(deps, prefs, localAvailable, effort);

  // Per-run model pin (Agent panel Model dropdown): when the user pinned a model for the RESOLVED
  // provider, route every tier (plan/exec/classify) to it instead of the router's per-tier choice. Read
  // live by the gateway, so a mid-run switch (pushed by the IPC layer) lands on the next request. The
  // host clears it when the run ends (the gateway is a process-global shared with other model callers).
  const pinnedModel = prefs.agentModelOverride[provider] ?? '';
  ModelGateway.setModelOverride(pinnedModel.length > 0 ? { provider, model: pinnedModel } : null);

  const route = ModelRouter.route({ capability: 'plan', costSaver, localAvailable, provider });
  // The reactive loop runs on the exec tier (cheaper/faster than the planning tier).
  const execRoute = ModelRouter.route({ capability: 'exec', costSaver, localAvailable, provider });

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
  const planned = await planOrEgressStop({
    intent: prompt,
    tools,
    provider: route.provider,
    model: route.model,
    maxTokens,
    history,
  });
  if ('egressFailure' in planned) {
    emitCheckpoint(terminalCheckpoint(transition('fail'), 'egress_blocked', planned.egressFailure));
    hooks.onEvent('error', planned.egressFailure.message);
    return { stoppedReason: 'egress_blocked', ok: false, checkpoint: lastCheckpoint };
  }
  const plan = planned.plan;
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

  const result = await runReactiveLoop({
    prompt,
    plan,
    approvedPlan,
    skip,
    tools,
    execRoute,
    maxTokens,
    history,
    phase,
    hooks,
    deps,
    emitCheckpoint,
  });
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
    terminalMessageFor(result.stoppedReason, result.summary, failure),
    `${String(usage.totalTokens)} tokens`,
  );
  return {
    stoppedReason: result.stoppedReason,
    ok: result.stoppedReason === 'completed',
    checkpoint: lastCheckpoint,
    tokenUsage: {
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      totalTokens: usage.totalTokens,
    },
    steps: result.outcomes.map((o) => {
      const targetUrl = navTargetOf(o.args);
      return {
        tool: o.tool,
        ok: o.ok,
        durationMs: o.durationMs,
        ...(o.error?.message !== undefined ? { error: o.error.message } : {}),
        ...(targetUrl !== undefined ? { targetUrl } : {}),
      };
    }),
    ...(result.summary !== undefined && result.summary.length > 0
      ? { summary: result.summary }
      : {}),
  };
}
