import {
  CriticVerdictSchema,
  type CriticRequest,
  type CriticVerdict,
  type RiskTier,
} from '@tepegoz/shared-types';

/**
 * The advisory intent-critic plane (S6 PR4).
 *
 * Position matters: this runs **after** the deterministic kernel and **before** dispatch, as a separate
 * plane. ADR-0006's property — the kernel is deterministic and pre-model — survives because the kernel's
 * decision is already made and cannot be changed here. The critic only observes.
 *
 * Three constraints do the work:
 *
 * 1. **It only sees mutating calls.** A `read` never reaches it, which bounds cost to the actions that
 *    could actually cause harm.
 * 2. **It never sees argument values.** Only key names and shapes, so the critic cannot become a second
 *    channel for the very secret the credential broker exists to keep out of model context.
 * 3. **It cannot block.** A divergence is journalled; the call proceeds. A blocking critic is one model
 *    deciding whether another may act, on the critical path, with no way to verify the judgement.
 */

/** Tiers whose calls are worth a second opinion. `read` is deliberately absent. */
const CRITIQUED_TIERS: ReadonlySet<RiskTier> = new Set([
  'ui-write',
  'data-egress',
  'financial',
  'credential',
  'destructive',
]);

/** True when this call is one the critic should look at. */
export function shouldCritique(tier: RiskTier | undefined): boolean {
  return tier !== undefined && CRITIQUED_TIERS.has(tier);
}

/** How much of one argument key/shape description is kept. */
const MAX_SUMMARY = 500;

/**
 * Describe arguments **without their values**.
 *
 * A key name and a type are enough to judge "is this the action the user asked for"; the value is not,
 * and including it would put passwords, tokens and card numbers into a model prompt on every gated call.
 * Nested objects are summarised by their keys for the same reason.
 */
export function summarizeArgs(args: unknown): string {
  if (args === null || typeof args !== 'object') return typeof args;
  const parts: string[] = [];
  for (const [key, value] of Object.entries(args as Record<string, unknown>)) {
    if (Array.isArray(value)) {
      parts.push(`${key}: array(${String(value.length)})`);
    } else if (value !== null && typeof value === 'object') {
      parts.push(`${key}: {${Object.keys(value).join(',')}}`);
    } else if (typeof value === 'string') {
      // Length, not content. "url: string(52)" says what the call shapes like; the URL itself does not
      // need to be here, and a page-derived string is exactly what we do not want to re-inject.
      parts.push(`${key}: string(${String(value.length)})`);
    } else {
      parts.push(`${key}: ${typeof value}`);
    }
  }
  return parts.join(', ').slice(0, MAX_SUMMARY);
}

/** The injected critic. Absent ⇒ no critic runs, which is the default. */
export type IntentCritic = (req: CriticRequest) => Promise<unknown>;

let critic: IntentCritic | null = null;

/** Install (or clear, with `null`) the advisory critic. Flag-gated by the host. */
export function setIntentCritic(next: IntentCritic | null): void {
  critic = next;
}

export function hasIntentCritic(): boolean {
  return critic !== null;
}

/**
 * Ask the critic, if one is installed and this call is worth asking about.
 *
 * Returns `null` when nothing was asked. **Every failure mode is also `null`**: no critic, a rejected
 * verdict shape, a thrown critic. An advisory plane that could turn its own malfunction into a blocked
 * or failed action would be neither advisory nor safe.
 */
export async function critiqueIntent(
  req: CriticRequest,
  tier: RiskTier | undefined,
): Promise<CriticVerdict | null> {
  if (critic === null || !shouldCritique(tier)) return null;
  try {
    const raw = await critic(req);
    const parsed = CriticVerdictSchema.safeParse(raw);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
