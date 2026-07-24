/**
 * Constant error messages for the planner (internal-ai-rules: messages live in a messages file, never
 * inline at throw sites). Dynamic values go through the typed factory.
 */
export const PlannerMessages = {
  InvalidJson: 'Planner returned invalid JSON',
  MalformedPlan: 'Planner returned a malformed plan',
  MalformedValidation: 'Completion validator returned a malformed verdict',
  // Replan is ADVISORY (a best-effort steer, not an authority): a malformed reply is logged and dropped,
  // never thrown — the run continues without a new plan.
  ReplanUnusable: 'Replanner returned an unusable reply; continuing without a new plan',
  unknownTool: (tool: string): string => `Planner referenced unknown tool: ${tool}`,
} as const;

/** Constant error messages for the reactive executor's untrusted-output boundary. */
export const ReactorMessages = {
  InvalidJson: 'Agent returned invalid JSON',
  MalformedDecision: 'Agent returned a malformed decision',
} as const;
