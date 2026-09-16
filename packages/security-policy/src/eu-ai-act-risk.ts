import { z } from 'zod';

/**
 * EU AI Act Annex III risk gate.
 *
 * `docs/ai-transparency.md` §3 states tepegöz's own risk classification as fact: "limited-risk AI
 * system … not deployed for any Annex III high-risk use case, performs no biometric categorization,
 * social scoring, or automated legal/eligibility decisions." Until this file, that was a claim about
 * intended use, not a property the code enforced — nothing stopped the agent from autonomously
 * driving a form on exactly such a service. This makes the claim structural: sites whose entire
 * purpose IS one of those three named Annex III categories are locked from autonomous action the same
 * way {@link isSensitiveSite} locks banking/health, so "not deployed for" holds by construction rather
 * than by promise.
 *
 * Deliberately narrow: this does not attempt the full EU AI Act Annex III taxonomy (critical
 * infrastructure, education, essential services, migration/border control, administration of
 * justice — a much larger and more contestable classification job). It covers exactly the three
 * categories `ai-transparency.md` already commits tepegöz to never touching, so the gate cannot
 * silently drift out of sync with the document it exists to keep honest.
 *
 * Same matching discipline as `sensitive-site.ts`: hostname-based, over-matching is the safe
 * direction, and absence from this map is not a safety claim.
 */

export const EU_AI_ACT_HIGH_RISK_CATEGORIES = [
  'biometric-categorization',
  'social-scoring',
  'legal-eligibility',
] as const;

export type EuAiActHighRiskCategory = (typeof EU_AI_ACT_HIGH_RISK_CATEGORIES)[number];

export const EuAiActHighRiskCategorySchema = z.enum(EU_AI_ACT_HIGH_RISK_CATEGORIES);

interface CategoryRules {
  /** Matched with `host.includes(...)`. Use for words that are meaningful anywhere in a hostname. */
  readonly substrings: readonly string[];
  /** Matched as `host === s` or `host.endsWith('.' + s)`. Use for concrete registrable domains. */
  readonly suffixes: readonly string[];
}

const CATEGORY_MAP: Readonly<Record<EuAiActHighRiskCategory, CategoryRules>> = {
  // Biometric identification/categorization services — facial/voice/gait recognition sold as a
  // product, including AI-driven video interview analysis that scores a candidate from biometric
  // signal (an Annex III employment+biometric overlap case).
  'biometric-categorization': {
    substrings: ['clearview', 'onfido', 'jumio', 'veriff', 'incode', 'hirevue'],
    suffixes: ['idnow.io', 'clearview.ai'],
  },
  // Automated social-scoring systems that rank a person's trustworthiness/standing from behavioral
  // data, the exact Annex III practice named in ai-transparency.md.
  'social-scoring': {
    substrings: ['socialcredit', 'zhimaxinyong', 'sesamecredit'],
    suffixes: ['credit.alipay.com'],
  },
  // Automated legal/eligibility decisions — commercial credit-scoring bureaus whose product IS an
  // automated eligibility decision (loan/tenancy/insurance underwriting), Turkish and international.
  'legal-eligibility': {
    substrings: [],
    suffixes: ['equifax.com', 'experian.com', 'transunion.com', 'kkb.com.tr', 'findeks.com'],
  },
};

function hostOf(rawUrl: string): string | null {
  try {
    const host = new URL(rawUrl).hostname.toLowerCase();
    return host.length > 0 ? host : null;
  } catch {
    return null;
  }
}

function matches(host: string, rules: CategoryRules): boolean {
  if (rules.substrings.some((s) => host.includes(s))) return true;
  return rules.suffixes.some((s) => host === s || host.endsWith(`.${s}`));
}

/**
 * The Annex III high-risk category a URL falls into, or `null` when it matches nothing.
 *
 * Categories are checked in {@link EU_AI_ACT_HIGH_RISK_CATEGORIES} order and the first match wins, so
 * a URL that plausibly fits two categories gets a stable, deterministic answer.
 */
export function euAiActHighRiskCategory(rawUrl: string): EuAiActHighRiskCategory | null {
  const host = hostOf(rawUrl);
  if (host === null) return null;
  for (const category of EU_AI_ACT_HIGH_RISK_CATEGORIES) {
    if (matches(host, CATEGORY_MAP[category])) return category;
  }
  return null;
}

/** Whether a URL falls into an Annex III high-risk category this product commits to never touching. */
export function isEuAiActHighRisk(rawUrl: string): boolean {
  return euAiActHighRiskCategory(rawUrl) !== null;
}
