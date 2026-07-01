/**
 * Constant error messages for the planner (internal-ai-rules: messages live in a messages file, never
 * inline at throw sites). Dynamic values go through the typed factory.
 */
export const PlannerMessages = {
  InvalidJson: 'Planner returned invalid JSON',
  MalformedPlan: 'Planner returned a malformed plan',
  unknownTool: (tool: string): string => `Planner referenced unknown tool: ${tool}`,
} as const;
