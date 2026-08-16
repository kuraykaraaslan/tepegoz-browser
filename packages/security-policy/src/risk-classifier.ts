import {
  highestRiskTier,
  type RiskLevel,
  type RiskTier,
  type ToolDescriptor,
} from '@tepegoz/shared-types';
import { sensitiveCategory } from './sensitive-site';
import { isSameSite } from './registrable-domain';

/**
 * Deterministic tool × argument risk classification (L8).
 *
 * Every gated call resolves to **exactly one** of the six {@link RiskTier}s, computed in plain code
 * before the model is involved — same inputs, same tier, always. The declared `dangerClass` is only
 * the **floor**: it is author-supplied and argument-blind, so it cannot tell a search box from a
 * password field. The rules below raise that floor by inspecting what the call actually does, and the
 * **highest applicable tier wins**, so adding a rule can only ever tighten a classification.
 *
 * Why argument inspection is safe to do here: this runs in main on the already-`safeParse`d tool args,
 * it never executes or interprets them, and every rule is a pure string/URL test. A tool that lies
 * about its `dangerClass` gets classified on its behaviour anyway.
 */

/** Keys whose VALUE is a secret. Matched case-insensitively as a whole-ish token in the key path. */
const CREDENTIAL_KEY_PATTERNS: readonly RegExp[] = [
  /pass(word|wd|phrase)?\b/i,
  /\bpwd\b/i,
  /\bsecret\b/i,
  /\btoken\b/i,
  /\bapi[-_]?key\b/i,
  /\bcredential/i,
  /\botp\b/i,
  /\b(two|2)fa\b/i,
  /\bcvv\b/i,
  /\bcvc\b/i,
  /card[-_]?(number|no)\b/i,
  /\biban\b/i,
  // Turkish
  /\bparola\b/i,
  /\bşifre\b/i,
  /\bsifre\b/i,
  /\bgizli\b/i,
  /\bkart[-_]?(numaras[ıi]|no)\b/i,
];

/** Field/selector hints that mean "this input holds a secret" even when the arg key is generic. */
const CREDENTIAL_VALUE_HINTS: readonly RegExp[] = [
  /type\s*=\s*["']?password/i,
  /input\[type=["']?password/i,
  /autocomplete\s*=\s*["']?(current|new)-password/i,
];

/** Tool-id fragments that mean the call moves money. */
const FINANCIAL_ID_PATTERNS: readonly RegExp[] = [
  /_(pay|purchase|checkout|transfer|order)_/i,
  /payment/i,
  /billing/i,
];

/** Tool-id fragments that mean data leaves the device or crosses an origin. */
const EGRESS_ID_PATTERNS: readonly RegExp[] = [
  /_upload_/i,
  /_export_/i,
  /_send_/i,
  /_post_/i,
  /^web_/i,
  /^http_/i,
  /_search_/i,
  /fetch/i,
  /email/i,
];

/** Tool-id fragments that mean irreversible loss. */
const DESTRUCTIVE_ID_PATTERNS: readonly RegExp[] = [/_delete_/i, /_remove_/i, /_purge_/i, /_wipe_/i];

/** `dangerClass` → the tier it guarantees at minimum. */
const FLOOR_BY_DANGER_CLASS: Readonly<Record<RiskLevel, RiskTier>> = {
  read: 'read',
  state_changing: 'ui-write',
  financial: 'financial',
  destructive: 'destructive',
};

export interface RiskClassificationContext {
  descriptor: Pick<ToolDescriptor, 'id' | 'dangerClass'>;
  /** The already-validated tool arguments. Inspected as data, never executed. */
  args?: unknown;
  /** The URL the action targets, when site-scoped. */
  targetUrl?: string;
  /** Origin the run started from, so a cross-origin submission can be told from a same-origin one. */
  originUrl?: string;
}

export interface RiskClassification {
  tier: RiskTier;
  /** Stable reason codes, most significant first — every rule that fired, for Permission Debug. */
  reasons: readonly string[];
}

/** Flatten args into `key path → string value` pairs, bounded so a hostile payload cannot blow up. */
function flatten(value: unknown, path: string, out: { k: string; v: string }[], depth: number): void {
  if (out.length >= 200 || depth > 6) return;
  if (value === null || value === undefined) return;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    out.push({ k: path, v: String(value) });
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((v, i) => { flatten(v, `${path}[${String(i)}]`, out, depth + 1); });
    return;
  }
  if (typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      flatten(v, path.length > 0 ? `${path}.${k}` : k, out, depth + 1);
    }
  }
}


export function classifyRisk(ctx: RiskClassificationContext): RiskClassification {
  const tiers: RiskTier[] = [FLOOR_BY_DANGER_CLASS[ctx.descriptor.dangerClass]];
  const reasons: string[] = [`declared_${ctx.descriptor.dangerClass}`];
  const id = ctx.descriptor.id;

  if (DESTRUCTIVE_ID_PATTERNS.some((r) => r.test(id))) {
    tiers.push('destructive');
    reasons.push('destructive_verb');
  }
  if (FINANCIAL_ID_PATTERNS.some((r) => r.test(id))) {
    tiers.push('financial');
    reasons.push('financial_tool');
  }
  if (EGRESS_ID_PATTERNS.some((r) => r.test(id))) {
    tiers.push('data-egress');
    reasons.push('egress_tool');
  }

  const pairs: { k: string; v: string }[] = [];
  flatten(ctx.args, '', pairs, 0);

  if (
    pairs.some(
      ({ k, v }) =>
        CREDENTIAL_KEY_PATTERNS.some((r) => r.test(k)) ||
        CREDENTIAL_VALUE_HINTS.some((r) => r.test(v)),
    )
  ) {
    tiers.push('credential');
    reasons.push('credential_argument');
  }

  // A submission that leaves the run's own site is an egress event regardless of the tool's id.
  // Uses proper eTLD+1 resolution: comparing the last two labels — which an earlier draft of this file
  // did — is wrong in the UNSAFE direction for multi-part suffixes, since `shop.com.tr` and
  // `evil.com.tr` would both reduce to `com.tr` and be judged same-site, silently suppressing the
  // egress signal on exactly the domains this product cares most about.
  if (
    ctx.targetUrl !== undefined &&
    ctx.originUrl !== undefined &&
    ctx.descriptor.dangerClass !== 'read' &&
    !isSameSite(ctx.targetUrl, ctx.originUrl)
  ) {
    tiers.push('data-egress');
    reasons.push('cross_site_target');
  }

  // A sensitive destination raises the tier even for an otherwise ordinary action: typing into a
  // banking or government page is not the same act as typing into a blog.
  if (ctx.targetUrl !== undefined) {
    const category = sensitiveCategory(ctx.targetUrl);
    if (category !== null && ctx.descriptor.dangerClass !== 'read') {
      tiers.push(category === 'banking' || category === 'crypto' ? 'financial' : 'credential');
      reasons.push(`sensitive_site_${category}`);
    }
  }

  return { tier: highestRiskTier(tiers), reasons };
}
