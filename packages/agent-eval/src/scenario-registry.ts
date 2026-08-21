import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { EvalScenarioFileSchema, type EvalScenario } from '@tepegoz/shared-types';

/** A registry file that failed to load — surfaced in the report, never thrown (an eval must not crash
 *  on one bad entry). */
export interface RegistryError {
  file: string;
  reason: string;
}

export interface LoadedRegistry {
  scenarios: EvalScenario[];
  errors: RegistryError[];
}

/**
 * Load the data-driven scenario registry: every `*.json` under `dir` is JSON-parsed and
 * `EvalScenarioFileSchema.safeParse`d (the registry is UNTRUSTED disk input). Valid scenarios are
 * collected; a malformed file or a duplicate id is recorded as a {@link RegistryError} and skipped.
 * A new scenario is one JSON entry — no code change.
 */
export function loadScenarios(dir: string): LoadedRegistry {
  const scenarios: EvalScenario[] = [];
  const errors: RegistryError[] = [];
  const seen = new Set<string>();

  let files: string[];
  try {
    files = readdirSync(dir)
      .filter((f) => f.endsWith('.json'))
      .sort();
  } catch (err) {
    return {
      scenarios,
      errors: [{ file: dir, reason: `cannot read registry dir: ${String(err)}` }],
    };
  }

  for (const file of files) {
    const path = join(dir, file);
    let raw: unknown;
    try {
      raw = JSON.parse(readFileSync(path, 'utf8'));
    } catch (err) {
      errors.push({ file, reason: `invalid JSON: ${String(err)}` });
      continue;
    }
    const parsed = EvalScenarioFileSchema.safeParse(raw);
    if (!parsed.success) {
      errors.push({
        file,
        reason: `schema: ${parsed.error.issues.map((i) => `${i.path.join('.')} ${i.message}`).join('; ')}`,
      });
      continue;
    }
    for (const scenario of parsed.data.scenarios) {
      if (seen.has(scenario.id)) {
        errors.push({ file, reason: `duplicate scenario id "${scenario.id}"` });
        continue;
      }
      seen.add(scenario.id);
      scenarios.push(scenario);
    }
  }

  return { scenarios, errors };
}

/** Split a scenario set into the development set and the held-out set (reported separately so a fix
 *  can never be tuned against the held-out metric). */
export function partitionHeldOut(scenarios: readonly EvalScenario[]): {
  dev: EvalScenario[];
  heldOut: EvalScenario[];
} {
  const dev: EvalScenario[] = [];
  const heldOut: EvalScenario[] = [];
  for (const s of scenarios) (s.heldOut ? heldOut : dev).push(s);
  return { dev, heldOut };
}
