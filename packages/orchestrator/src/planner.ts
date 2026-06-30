import { AppError } from '@tepegoz/libs';
import { ModelGateway, type CanonRequest } from '@tepegoz/model-gateway';
import { PlanSchema, type AIProvider, type Plan, type ToolDescriptor } from '@tepegoz/shared-types';

/**
 * L3 Planner: natural-language intent → a validated {@link Plan} (DAG of tool-call steps). The LLM's
 * output is UNTRUSTED — it is JSON-extracted, zod-validated against PlanSchema, and every referenced
 * tool is checked against the registered tool set before the plan is allowed to run. Phase 1a plans
 * execute sequentially (see Executor); the editable plan-preview/HITL gate lives in the UI layer.
 */
export interface PlanRequest {
  intent: string;
  tools: Pick<ToolDescriptor, 'id' | 'description' | 'dangerClass'>[];
  provider: AIProvider;
  model: string;
  maxTokens?: number;
  timeoutMs?: number;
}

function extractJson(text: string): string {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  const body = fenced?.[1] ?? text;
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  return start >= 0 && end > start ? body.slice(start, end + 1) : body;
}

export default class Planner {
  static async plan(req: PlanRequest): Promise<Plan> {
    const toolList = req.tools
      .map((t) => `- ${t.id} (${t.dangerClass}): ${t.description}`)
      .join('\n');
    const system =
      'You are the planner for an agentic browser. Produce a plan of tool-call steps that ' +
      "accomplishes the user's goal. Output ONLY JSON of the form " +
      '{"goal": string, "steps": [{"id": string, "tool": string, "args": object, "rationale": string, "dependsOn": string[]}]}. ' +
      `Use ONLY these tools (by exact id):\n${toolList}\n` +
      'No prose and no markdown fences.';

    const canon: CanonRequest = {
      provider: req.provider,
      model: req.model,
      capability: 'plan',
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: req.intent },
      ],
      maxTokens: req.maxTokens ?? 2000,
      timeoutMs: req.timeoutMs ?? 60_000,
    };

    const response = await ModelGateway.complete(canon);

    let raw: unknown;
    try {
      raw = JSON.parse(extractJson(response.text));
    } catch {
      throw new AppError('Planner returned invalid JSON', 502);
    }

    const parsed = PlanSchema.safeParse(raw);
    if (!parsed.success) {
      throw new AppError('Planner returned a malformed plan', 502);
    }

    const known = new Set(req.tools.map((t) => t.id));
    for (const step of parsed.data.steps) {
      if (!known.has(step.tool)) {
        throw new AppError(`Planner referenced unknown tool: ${step.tool}`, 502);
      }
    }
    return parsed.data;
  }
}
