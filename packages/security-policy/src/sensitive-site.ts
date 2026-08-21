import { z } from 'zod';

/**
 * Sensitive-site detection for the **sensitive-site lockout** (banking, government, crypto, password
 * managers, health) — these are locked from automation by default (deny state-changing actions, ask on
 * read).
 *
 * Replaces the v1 flat keyword list with an **extensible category map**. Two things changed and both
 * matter:
 *
 * 1. **A match now carries a category**, not just a boolean. The approval UI can say *why* a site is
 *    locked ("this looks like a banking site"), which is what turns a lockout from a mysterious refusal
 *    into an explainable one — and permission fatigue is itself a vulnerability.
 * 2. **Turkish banking and government are covered.** The v1 list was entirely English/US-centric:
 *    `garanti.com.tr`, `turkiye.gov.tr`, `sgk.gov.tr` and the rest matched **nothing**, so the single
 *    most sensitive category of site for this product's primary market was silently unlocked.
 *
 * Matching stays hostname-based and **over-matching is still the safe direction** (deny > allow on a
 * sensitive site). Absence from this map is NOT a statement that a site is safe. Per-site Scoped Trust
 * Profiles refine this later; this map is the deterministic floor.
 */

export const SENSITIVE_CATEGORIES = [
  'banking',
  'government',
  'crypto',
  'password-manager',
  'health',
] as const;

export type SensitiveCategory = (typeof SENSITIVE_CATEGORIES)[number];

export const SensitiveCategorySchema = z.enum(SENSITIVE_CATEGORIES);

/**
 * A rule matches a hostname either as a **substring** (broad, catches `mybank.example`) or as a
 * **domain suffix** (exact — matches the domain and its sub-domains only, so `gov.tr` does not also
 * match `notgov.trap.example`).
 */
interface CategoryRules {
  /** Matched with `host.includes(...)`. Use for words that are meaningful anywhere in a hostname. */
  readonly substrings: readonly string[];
  /** Matched as `host === s` or `host.endsWith('.' + s)`. Use for concrete registrable domains. */
  readonly suffixes: readonly string[];
}

const CATEGORY_MAP: Readonly<Record<SensitiveCategory, CategoryRules>> = {
  banking: {
    substrings: [
      'bank', // catches bankofamerica, akbank, denizbank, halkbank, isbank, sekerbank, …
      'paypal',
      'venmo',
      'wallet',
      'iyzico',
      'papara',
      'payoneer',
      'wise.com',
    ],
    suffixes: [
      // Turkish retail banking — the v1 list matched none of these.
      'garanti.com.tr',
      'garantibbva.com.tr',
      'akbank.com',
      'isbank.com.tr',
      'yapikredi.com.tr',
      'ziraatbank.com.tr',
      'vakifbank.com.tr',
      'halkbank.com.tr',
      'denizbank.com',
      'teb.com.tr',
      'qnbfinansbank.com',
      'sekerbank.com.tr',
      'enpara.com',
      'ingbank.com.tr',
      'kuveytturk.com.tr',
      'albaraka.com.tr',
      'odeabank.com.tr',
      'anadolubank.com.tr',
      'fibabanka.com.tr',
      'burgan.com.tr',
      // International
      'revolut.com',
      'n26.com',
      'chase.com',
      'wellsfargo.com',
      'hsbc.com',
    ],
  },
  government: {
    substrings: [],
    suffixes: [
      // One suffix covers the whole Turkish public-sector tree — e-Devlet (turkiye.gov.tr), tax
      // (gib), social security (sgk), health appointments (mhrs), identity (nvi), land registry
      // (tkgm), judiciary (uyap). Listing them individually would be redundant, not safer.
      'gov.tr',
      // Turkish municipalities sit under bel.tr, outside the gov.tr tree.
      'bel.tr',
      // Other jurisdictions
      'gov.uk',
      'gov',
      'europa.eu',
    ],
  },
  crypto: {
    substrings: ['coinbase', 'binance', 'kraken', 'metamask', 'crypto', 'blockchain', 'ledger.com'],
    suffixes: ['bitci.com', 'paribu.com', 'btcturk.com', 'okx.com', 'bybit.com'],
  },
  'password-manager': {
    substrings: ['1password', 'lastpass', 'bitwarden', 'dashlane', 'keeper', 'nordpass'],
    suffixes: ['passbolt.com', 'proton.me'],
  },
  health: {
    substrings: [
      'mychart',
      'healthcare',
      'medical',
      'patient',
      'nhs',
      'saglik',
      'sağlık',
      'hastane',
    ],
    suffixes: ['enabiz.gov.tr', 'saglik.gov.tr'],
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
 * The sensitive category a URL falls into, or `null` when it matches nothing.
 *
 * Categories are checked in {@link SENSITIVE_CATEGORIES} order and the first match wins, so a URL that
 * plausibly fits two categories gets a stable, deterministic answer rather than an order-dependent one.
 */
export function sensitiveCategory(rawUrl: string): SensitiveCategory | null {
  const host = hostOf(rawUrl);
  if (host === null) return null;
  for (const category of SENSITIVE_CATEGORIES) {
    if (matches(host, CATEGORY_MAP[category])) return category;
  }
  return null;
}

/** Whether a URL is sensitive at all. Unchanged contract — the boolean the policy kernel gates on. */
export function isSensitiveSite(rawUrl: string): boolean {
  return sensitiveCategory(rawUrl) !== null;
}
