import { z } from 'zod';
import { ToolNameSchema } from './tool-descriptor';

/**
 * Agent plan = a DAG of tool-call steps (single source of truth, validated at the trust boundary —
 * the planner LLM's output is untrusted). Phase 1a executes steps **sequentially**; `dependsOn`
 * carries the dependency edges so Phase 1b can run independent branches in parallel without a schema
 * change.
 */
export const PlanStepSchema = z.object({
  id: z.string().min(1),
  /** Must be a registered tool name ({domain}_{verb}_{noun}). */
  tool: ToolNameSchema,
  /** Tool arguments (opaque here; validated by the tool's own schema at the gateway). */
  args: z.unknown(),
  /** Human-readable justification, shown in the editable plan preview + Agent Console. Capped — the
   *  planner LLM is untrusted and must not flood the journal/UI with unbounded strings. */
  rationale: z.string().max(500).default(''),
  /** IDs of steps that must complete first (empty ⇒ runs in sequence). */
  dependsOn: z.array(z.string()).default([]),
});
export type PlanStep = z.infer<typeof PlanStepSchema>;

export const PlanSchema = z.object({
  goal: z.string().max(1000).default(''),
  steps: z.array(PlanStepSchema),
});
export type Plan = z.infer<typeof PlanSchema>;
