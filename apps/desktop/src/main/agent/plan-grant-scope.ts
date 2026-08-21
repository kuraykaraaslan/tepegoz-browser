import { classifyRisk } from '@tepegoz/security-policy';
import type { Plan, RiskLevel, RiskTier } from '@tepegoz/shared-types';

/**
 * Derive the **scope** of the grant an approved plan should mint: which sites it touches and which
 * risk classes its steps fall into.
 *
 * The scope comes from the plan itself, never from a default. A grant that defaulted to "the whole run"
 * would be a blanket permission wearing a plan's clothes — the point of `follow_a_plan` is that the
 * user consented to *these* steps on *these* sites.
 *
 * Kept free of Electron imports so the derivation is unit-testable off the main process. Actual
 * minting, coverage and revocation live in `PlanGrantStore` (L8); this module only reads a plan.
 */

/** How a step's tool resolves to its declared danger class. Injected so this stays registry-agnostic. */
export type DangerClassLookup = (toolId: string) => RiskLevel | undefined;

export interface PlanGrantScope {
  /** URLs the plan touches — the entry page plus any URL found in a step's arguments. */
  urls: string[];
  /** Risk tiers the plan's steps classify into. */
  tiers: RiskTier[];
}

const URL_IN_STRING = /https?:\/\/[^\s"'<>)\]]+/gi;

/** Collect http(s) URLs appearing anywhere in a step's arguments, bounded against hostile payloads. */
function collectUrls(value: unknown, out: Set<string>, depth: number): void {
  if (out.size >= 50 || depth > 6 || value === null || value === undefined) return;
  if (typeof value === 'string') {
    for (const m of value.match(URL_IN_STRING) ?? []) {
      out.add(m);
      if (out.size >= 50) return;
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const v of value) collectUrls(v, out, depth + 1);
    return;
  }
  if (typeof value === 'object') {
    for (const v of Object.values(value)) collectUrls(v, out, depth + 1);
  }
}

/**
 * Read an approved plan into a grant scope.
 *
 * A step whose tool is **not in the registry** is deliberately skipped rather than defaulted: an
 * unknown tool must not contribute a tier to the grant, because a grant may only ever be as wide as
 * what was actually understood at approval time. If that step later runs, it prompts.
 */
export function planGrantScope(
  plan: Plan,
  entryUrl: string | null,
  lookupDangerClass: DangerClassLookup,
): PlanGrantScope {
  const urls = new Set<string>();
  if (entryUrl !== null && entryUrl.length > 0) urls.add(entryUrl);

  const tiers = new Set<RiskTier>();
  for (const step of plan.steps) {
    collectUrls(step.args, urls, 0);
    const dangerClass = lookupDangerClass(step.tool);
    if (dangerClass === undefined) continue; // unknown tool → contributes nothing
    tiers.add(classifyRisk({ descriptor: { id: step.tool, dangerClass }, args: step.args }).tier);
  }

  return { urls: [...urls], tiers: [...tiers] };
}
