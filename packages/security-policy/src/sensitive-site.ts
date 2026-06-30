/**
 * Sensitive-site detection for the **sensitive-site lockout** (banks, crypto, password managers,
 * health) — these are locked from automation by default (deny state-changing actions, ask on read).
 *
 * v1 heuristic: hostname keyword/known-host match. Over-matching is the SAFE direction here (deny >
 * allow on a sensitive site). The list is tunable and will be refined by per-site Scoped Trust
 * Profiles in a later phase; do not treat absence from this list as "safe".
 */
const SENSITIVE_KEYWORDS: readonly string[] = [
  // Banking / payments
  'bank',
  'paypal',
  'venmo',
  'wallet',
  // Crypto
  'coinbase',
  'binance',
  'kraken',
  'metamask',
  'crypto',
  // Password managers
  '1password',
  'lastpass',
  'bitwarden',
  'dashlane',
  'keeper',
  // Health
  'mychart',
  'healthcare',
  'medical',
  'patient',
  'nhs',
];

export function isSensitiveSite(rawUrl: string): boolean {
  let host: string;
  try {
    host = new URL(rawUrl).hostname.toLowerCase();
  } catch {
    return false;
  }
  if (host.length === 0) return false;
  return SENSITIVE_KEYWORDS.some((keyword) => host.includes(keyword));
}
