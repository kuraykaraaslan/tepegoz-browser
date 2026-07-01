import { AppError } from '@tepegoz/libs';
import { AnthropicProvider, ModelGateway, ModelRouter, TokenLedger } from '@tepegoz/model-gateway';
import { CapabilityRegistry, ToolGateway, type ConfirmRequest } from '@tepegoz/capability-plane';
import { Executor, Planner, type StepOutcome } from '@tepegoz/orchestrator';
import type { Plan } from '@tepegoz/shared-types';
import type { AgentEventKind } from '../../shared/ipc-contract';
import CredentialVault from '../security/credential-vault';
import PreferenceStore from '../preferences/preference-store';
import { registerBuiltinTools } from './builtin-tools';

/**
 * L3 orchestration entry point (Phase 1a end-to-end): user prompt → ModelRouter → Planner (DAG) →
 * sequential Executor through the single ToolGateway PEP (Policy Kernel + HITL) → live Agent Console
 * events. The provider is registered from the safeStorage vault key at run time; the raw key never
 * leaves the main process. Provider-agnostic by design; Phase 1a is Claude-only.
 */
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

export interface AgentRunSummary {
  stoppedReason: string;
  ok: boolean;
}

export default class AgentService {
  static async run(prompt: string, hooks: AgentRunHooks): Promise<AgentRunSummary> {
    const prefs = PreferenceStore.getAll();
    const provider = prefs.defaultProvider;
    if (provider !== 'anthropic') {
      throw new AppError(`Provider "${provider}" is not supported yet (Phase 1a is Claude-only)`, 501);
    }
    const apiKey = CredentialVault.getKey(provider);
    if (apiKey === null) {
      throw new AppError('No API key configured. Add one in Settings → Providers.', 401);
    }

    const route = ModelRouter.route({
      capability: 'plan',
      costSaver: prefs.useLocalModelForSimpleTasks,
      provider,
    });
    ModelGateway.register(new AnthropicProvider({ apiKey, effort: route.effort }));

    registerBuiltinTools();
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

    ToolGateway.setConfirmHandler(hooks.requestApproval);
    ToolGateway.setAuditHandler((entry) => {
      hooks.onEvent('step_start', `${entry.toolName}: ${entry.decision}`, entry.reason);
    });

    try {
      const result = await Executor.run(approvedPlan, {
        signal: hooks.signal,
        onStepEnd: (o: StepOutcome) => {
          if (o.ok) hooks.onEvent('step_ok', `${o.tool} ✓`);
          else hooks.onEvent('step_error', `${o.tool} ✗`, o.error?.message ?? 'failed');
        },
      });
      const usage = TokenLedger.totals();
      hooks.onEvent('done', `Finished: ${result.stoppedReason}`, `${String(usage.totalTokens)} tokens`);
      return { stoppedReason: result.stoppedReason, ok: result.stoppedReason === 'completed' };
    } finally {
      ToolGateway.setConfirmHandler(null);
      ToolGateway.setAuditHandler(null);
    }
  }
}
