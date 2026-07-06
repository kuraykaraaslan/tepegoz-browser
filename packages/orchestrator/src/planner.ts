import { AppError, Logger } from '@tepegoz/libs';
import { ModelGateway, type CanonMessage, type CanonRequest } from '@tepegoz/model-gateway';
import { PlanSchema, type AIProvider, type Plan, type ToolDescriptor } from '@tepegoz/shared-types';
import { PlannerMessages } from './messages';

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
  /** Prior conversation turns so the plan for a follow-up message accounts for earlier context. */
  history?: readonly CanonMessage[];
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
    // Coreference guidance — only when there ARE earlier turns, so a follow-up ("research this") plans
    // for the real subject rather than the literal pronoun.
    const coref =
      req.history && req.history.length > 0
        ? 'The messages before the goal are earlier turns of the SAME conversation. Resolve any pronoun ' +
          'or deictic in the goal (English: this/that/it/them; Turkish: bunu/şunu/onu/o/bunları) to the ' +
          'concrete subject from those earlier turns BEFORE planning. '
        : '';
    const system =
      'You are the planner for an agentic browser. Produce a plan of tool-call steps that ' +
      "accomplishes the user's goal. " +
      coref +
      'Prefer navigating the current tab with browser_update_location; only plan a tab_create_item when ' +
      'a new tab is genuinely needed (the current page must stay open or a side-by-side comparison). ' +
      'New tabs open in the background by default, so pass the returned id as `tabId` to browser_* tools ' +
      'when working on that tab; use tab_update_item only when the tab must become visible/focused. ' +
      'After browser_update_page or navigation, verify the result with browser_validate_page, ' +
      'browser_get_page, or browser_get_elements before continuing. Clean up agent-opened tabs with ' +
      'tab_delete_item when done. If text/a11y reads are insufficient, plan browser_get_screenshot as a ' +
      'visual fallback. If an interaction reports changed=false, re-read browser_get_elements and try a ' +
      'different ref instead of repeating the same action. ' +
      'Output ONLY JSON of the form ' +
      '{"goal": string, "steps": [{"id": string, "tool": string, "args": object, "rationale": string, "dependsOn": string[]}]}. ' +
      `Use ONLY these tools (by exact id):\n${toolList}\n` +
      'No prose and no markdown fences.';

    const canon: CanonRequest = {
      provider: req.provider,
      model: req.model,
      capability: 'plan',
      messages: [
        { role: 'system', content: system },
        ...(req.history ?? []),
        { role: 'user', content: req.intent },
      ],
      maxTokens: req.maxTokens ?? 2000,
      timeoutMs: req.timeoutMs ?? 60_000,
      responseFormat: 'json',
    };

    const response = await ModelGateway.complete(canon);

    let raw: unknown;
    try {
      raw = JSON.parse(extractJson(response.text));
    } catch {
      Logger.warn(PlannerMessages.InvalidJson, { raw: response.text.slice(0, 400) });
      throw new AppError(PlannerMessages.InvalidJson, 502);
    }

    const parsed = PlanSchema.safeParse(raw);
    if (!parsed.success) {
      Logger.warn(PlannerMessages.MalformedPlan, {
        raw: response.text.slice(0, 400),
        issues: parsed.error.issues,
      });
      throw new AppError(PlannerMessages.MalformedPlan, 502);
    }

    const known = new Set(req.tools.map((t) => t.id));
    for (const step of parsed.data.steps) {
      if (!known.has(step.tool)) {
        throw new AppError(PlannerMessages.unknownTool(step.tool), 502);
      }
    }
    return parsed.data;
  }
}
