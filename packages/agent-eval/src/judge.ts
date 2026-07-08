import { z } from 'zod';
import type { EvalScenario } from '@tepegoz/shared-types';

/**
 * Optional LLM-judge for open-ended scenarios (a `judgeRubric` with no mechanical ground truth). Kept
 * SECONDARY to `scoreScenario` — the ground-truth assertion always wins when present. The model call is
 * INJECTED (`complete`) so the prompt-building + verdict-parsing here stay pure and unit-testable, and so
 * the judge can run in the driver process independent of the agent under test. The model's output is
 * UNTRUSTED — the verdict is JSON-extracted + `safeParse`d at this boundary.
 */
export const JudgeVerdictSchema = z.object({
  pass: z.boolean(),
  /** The judge's self-reported confidence in [0,1]; clamped on parse. */
  confidence: z.number().min(0).max(1).default(0.5),
  reason: z.string().max(1000).default(''),
});
export type JudgeVerdict = z.infer<typeof JudgeVerdictSchema>;

export interface JudgeObservation {
  finalPageText: string;
  summary: string;
}

export interface JudgeMessages {
  system: string;
  user: string;
}

/** Pure: build the judge prompt from the scenario rubric + the run's observation. */
export function buildJudgePrompt(scenario: EvalScenario, obs: JudgeObservation): JudgeMessages {
  const rubric = scenario.success.judgeRubric ?? 'Did the agent accomplish the task?';
  return {
    system:
      'You are a strict, impartial grader for a web-agent evaluation. Decide ONLY whether the agent ' +
      'accomplished the task according to the rubric, judging by the evidence (the final page text and ' +
      "the agent's own summary). Do not reward effort or intent — only the achieved result. Output ONLY " +
      'JSON: {"pass": boolean, "confidence": number 0..1, "reason": string}. No prose, no fences.',
    user:
      `Task: ${scenario.task}\n` +
      `Rubric: ${rubric}\n\n` +
      `Agent summary:\n${obs.summary || '(none)'}\n\n` +
      `Final page text:\n${obs.finalPageText.slice(0, 6000) || '(empty)'}`,
  };
}

const FENCED = /```(?:json)?\s*([\s\S]*?)```/i;

/** Pure: extract + `safeParse` the judge's JSON verdict. Returns a fail-closed verdict on malformed
 *  output (an ungradeable judge must never be a silent pass). */
export function parseJudgeVerdict(text: string): JudgeVerdict {
  const fenced = FENCED.exec(text);
  const body = fenced?.[1] ?? text;
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  const json = start >= 0 && end > start ? body.slice(start, end + 1) : body;
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return { pass: false, confidence: 0, reason: 'judge returned non-JSON output' };
  }
  const parsed = JudgeVerdictSchema.safeParse(raw);
  if (!parsed.success) {
    return { pass: false, confidence: 0, reason: 'judge returned a malformed verdict' };
  }
  return parsed.data;
}

/** Run the judge: build the prompt, call the injected model, parse the verdict. */
export async function judgeScenario(
  scenario: EvalScenario,
  obs: JudgeObservation,
  complete: (messages: JudgeMessages) => Promise<string>,
): Promise<JudgeVerdict> {
  const text = await complete(buildJudgePrompt(scenario, obs));
  return parseJudgeVerdict(text);
}
