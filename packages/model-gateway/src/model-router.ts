import type { AIProvider } from '@tepegoz/shared-types';
import { ANTHROPIC_MODEL, LOCAL_MODEL, OPENAI_MODEL, type EffortLevel } from './models';

/**
 * Deterministic capability → model routing (L7). Maps each capability to a model tier and decides
 * local-vs-cloud transport based on the cost-saver toggle:
 *
 *   - SIMPLE capabilities (classify/summarize/redact/loop-detect/embed/extract) are eligible for
 *     local-SLM offload when the cost-saver toggle is ON.
 *   - In Phase 1a the local SLM is a NO-OP placeholder (localAvailable=false), so eligible calls
 *     transparently fall back to the cheap cloud classify tier — real on-device routing arrives in
 *     Phase 1b (ONNX/DirectML). The routing LOGIC ships now so nothing has to be rewritten.
 *
 * Pure: returns a decision; the ModelGateway executes it. The chosen model is looked up in the
 * provider's tier map ({@link PROVIDER_MODELS}), so adding a provider is a data change, not a code
 * branch here.
 */
export type ModelTier = keyof typeof ANTHROPIC_MODEL; // 'plan' | 'exec' | 'classify'
export type ModelTransport = 'local' | 'cloud';

/**
 * Per-provider tier → model map. Each provider shares the SAME `plan | exec | classify` keys, so the
 * router picks a provider's map and indexes by tier — no provider-specific branching. Gemini has no
 * adapter yet (not in RUNNABLE_AI_PROVIDERS), so it points at the Anthropic map as a total-map
 * placeholder; a run never resolves to it until a Gemini adapter ships.
 */
const PROVIDER_MODELS: Record<AIProvider, Record<ModelTier, string>> = {
  anthropic: ANTHROPIC_MODEL,
  openai: OPENAI_MODEL,
  gemini: ANTHROPIC_MODEL,
  local: LOCAL_MODEL,
};

/** Simple capabilities eligible for local-SLM offload under the cost-saver toggle. */
export const SIMPLE_CAPABILITIES: ReadonlySet<string> = new Set([
  'classify',
  'summarize',
  'redact',
  'loop_detect',
  'embed',
  'extract',
]);

/** Capabilities that require the planning-tier model. */
const PLAN_CAPABILITIES: ReadonlySet<string> = new Set(['plan']);

const TIER_EFFORT: Record<ModelTier, EffortLevel> = {
  plan: 'xhigh',
  exec: 'high',
  classify: 'low',
};

/** Placeholder model id for the local SLM transport (no-op in Phase 1a; ONNX/DirectML in 1b). */
export const LOCAL_SLM_MODEL = 'local-slm';

export interface RouteInput {
  capability: string;
  /** Settings cost-saver toggle (persisted L7 preference `useLocalModelForSimpleTasks`). */
  costSaver: boolean;
  /** Whether a local SLM is actually available. Phase 1a: false (no-op) → cloud fallback. */
  localAvailable?: boolean;
  /** Cloud provider to route to (default 'anthropic'). */
  provider?: AIProvider;
}

export interface RouteDecision {
  tier: ModelTier;
  transport: ModelTransport;
  provider: AIProvider;
  model: string;
  effort: EffortLevel;
  /** Stable reason code (Token Ledger / Permission Debug: why this route). */
  reason: string;
}

function tierFor(capability: string): ModelTier {
  if (PLAN_CAPABILITIES.has(capability)) return 'plan';
  if (SIMPLE_CAPABILITIES.has(capability)) return 'classify';
  return 'exec';
}

export class ModelRouter {
  static route(input: RouteInput): RouteDecision {
    const tier = tierFor(input.capability);
    const provider = input.provider ?? 'anthropic';
    const effort = TIER_EFFORT[tier];
    const eligibleForLocal = input.costSaver && SIMPLE_CAPABILITIES.has(input.capability);

    if (eligibleForLocal && input.localAvailable === true) {
      // A local offload is SERVED by the 'local' provider — report it directly so callers use the
      // decision's provider/model uniformly (regardless of which cloud provider was requested).
      return {
        tier,
        transport: 'local',
        provider: 'local',
        model: LOCAL_MODEL[tier],
        effort,
        reason: 'local_offload',
      };
    }

    const reason = eligibleForLocal ? 'local_unavailable_cloud_fallback' : `${tier}_cloud`;
    return { tier, transport: 'cloud', provider, model: PROVIDER_MODELS[provider][tier], effort, reason };
  }
}
