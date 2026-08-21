import { ModelGateway, type CanonToolDef } from '@tepegoz/model-gateway';
import type { AIProvider } from '@tepegoz/shared-types';

/**
 * Decision transport selection (S1 PR4).
 *
 * The live decision path parses JSON out of free text. That is not a stylistic choice — it is why a
 * verbose model hitting its output cap truncates mid-`state` and the whole turn is lost as a *parse*
 * failure, and why `salvageTruncatedState` had to exist at all. Where a provider can enforce an output
 * shape natively, the decision should ride there instead.
 *
 * **What is native here, and what deliberately is not.** The native arm exposes exactly ONE tool — the
 * decision itself — rather than publishing all ~30 browser tools as native tools. That is a considered
 * deviation from the obvious reading of "native tool-calling", for two reasons:
 *
 * 1. **It keeps the change a transport change.** A native call carries tool arguments and nothing else,
 *    so publishing the real tools would drop the progress brain (`evaluation_previous_goal` / `memory` /
 *    `next_goal`) and the typed `state` ledger that AI-3 and C1 built the loop around. That is a
 *    capability regression wearing a transport change's clothes.
 * 2. **It keeps the paired sweep honest.** S1's DoD is a *single-change* comparison. Changing the action
 *    space changes how the model selects tools; then a completion delta would no longer be attributable
 *    to the transport, and the ±10pp equivalence check would be measuring two things at once.
 *
 * So both arms send the byte-identical system prompt and produce the byte-identical {@link Decision}
 * shape. The only difference is whether that shape arrives inside prose or inside a schema the provider
 * enforced.
 */

export type DecisionMode = 'native' | 'json';

/** The single native tool the decision rides on. Prefixed like every other tool id in the plane. */
export const DECISION_TOOL_NAME = 'agent_emit_decision';

/**
 * The decision schema as JSON Schema, mirroring `DecisionSchema` in
 * [`reactor-decision.ts`](./reactor-decision.ts). Deliberately permissive about which fields are
 * required (only `action`): a provider that rejects a near-miss outright would turn a recoverable
 * decision into a dead turn, and zod is still the settle step for BOTH arms — this schema constrains,
 * it does not validate.
 */
export function decisionToolDef(): CanonToolDef {
  return {
    name: DECISION_TOOL_NAME,
    description:
      'Emit your single next decision. Use action "act" with a tool id and its args to take one step, ' +
      'or action "finish" with a summary when the goal is met or genuinely impossible.',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['act', 'finish'] },
        tool: { type: 'string', description: 'Tool id to run (action "act" only).' },
        args: { type: 'object', description: 'Arguments for that tool.' },
        rationale: { type: 'string', description: 'Why this step (action "act" only).' },
        summary: { type: 'string', description: 'What you accomplished (action "finish" only).' },
        evaluation_previous_goal: { type: 'string' },
        memory: { type: 'string' },
        next_goal: { type: 'string' },
        state: {
          type: 'object',
          description: 'Your typed working ledger; carry forward what you have already done.',
        },
      },
      required: ['action'],
    },
  };
}

/**
 * Resolve the transport for this run. `TEPEGOZ_DECISION_MODE` is read here rather than in the host so a
 * paired sweep flips exactly one environment variable and nothing else:
 *
 * - `native` — force the native arm (falls back to JSON when the adapter cannot do it, since forcing an
 *   unsupported transport would fail every turn rather than measure anything).
 * - `json` — force the legacy arm, even on a native-capable provider. This is the "before" arm.
 * - `auto` (default, and any unrecognised value) — native where the registered adapter supports it.
 */
export function resolveDecisionMode(
  provider: AIProvider,
  override?: DecisionMode | 'auto',
): DecisionMode {
  const requested = override ?? process.env.TEPEGOZ_DECISION_MODE ?? 'auto';
  if (requested === 'json') return 'json';
  // `native` and `auto` agree on the outcome: forcing a transport the registered adapter cannot speak
  // would fail every turn rather than measure anything, so both degrade to JSON off a native provider.
  return ModelGateway.supportsNativeTools(provider) ? 'native' : 'json';
}
