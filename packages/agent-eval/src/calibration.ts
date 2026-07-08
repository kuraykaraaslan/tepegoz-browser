import { readFileSync } from 'node:fs';
import { z } from 'zod';

/**
 * LLM-judge calibration: the judge is only trustworthy if it AGREES with humans. We keep a small
 * human-labelled sample (`calibration/human-labels.json`) and, after a live judged run, compute the
 * judge↔human agreement rate — recorded in the report so a drifting judge is visible, not silently
 * trusted. Pure agreement math here; the labels file is UNTRUSTED disk input, so it is `safeParse`d.
 */
export const HumanLabelSchema = z.object({ id: z.string().min(1), pass: z.boolean() });
export type HumanLabel = z.infer<typeof HumanLabelSchema>;

export const HumanLabelsFileSchema = z.object({ labels: z.array(HumanLabelSchema) });

/** One judge verdict to compare against a human label (keyed by scenario id). */
export interface JudgeSample {
  id: string;
  pass: boolean;
}

export interface Agreement {
  /** Scenarios present in BOTH the judge output and the human labels. */
  n: number;
  agreements: number;
  /** agreements / n (1 when there is nothing to compare — vacuously calibrated). */
  rate: number;
  /** Scenario ids where the judge disagreed with the human label. */
  disagreements: string[];
}

/** Pure: judge↔human agreement over scenarios present in both sets (matched by id). */
export function agreementRate(judge: readonly JudgeSample[], human: readonly HumanLabel[]): Agreement {
  const humanById = new Map(human.map((h) => [h.id, h.pass]));
  let n = 0;
  let agreements = 0;
  const disagreements: string[] = [];
  for (const j of judge) {
    const h = humanById.get(j.id);
    if (h === undefined) continue;
    n += 1;
    if (h === j.pass) agreements += 1;
    else disagreements.push(j.id);
  }
  return { n, agreements, rate: n === 0 ? 1 : agreements / n, disagreements };
}

/** Load + `safeParse` the human-labelled calibration sample; returns [] on a missing/invalid file. */
export function loadHumanLabels(path: string): HumanLabel[] {
  try {
    const parsed = HumanLabelsFileSchema.safeParse(JSON.parse(readFileSync(path, 'utf8')));
    return parsed.success ? parsed.data.labels : [];
  } catch {
    return [];
  }
}
