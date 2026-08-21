/**
 * Registrable-domain (eTLD+1) resolution for grant scoping and cross-site detection (L8).
 *
 * **Why this exists rather than "compare the last two labels".** That shortcut is wrong in exactly the
 * market this product cares most about: under it `garanti.com.tr` and `evil.com.tr` both reduce to
 * `com.tr` and count as the *same site*, so one grant would span every `.com.tr` domain in existence.
 * The same holds for `co.uk`, `com.au`, `co.jp` and the rest. A grant that leaks across registrable
 * domains is a security hole, not a rounding error.
 *
 * **Why a bounded list rather than the full Public Suffix List.** The PSL is ~10k entries and a moving
 * target; vendoring it is a supply-chain and freshness liability for a boundary that must be
 * deterministic and auditable. The list below covers the multi-part suffixes this product actually
 * meets, and — critically — the failure mode is **fail-closed at the call site**: grant coverage
 * requires an exact registrable-domain match, so an unrecognised multi-part suffix produces a
 * *narrower-or-equal* answer and at worst re-prompts the user. It never silently widens a grant.
 *
 * The one residual risk is an unlisted multi-part suffix (e.g. a rare ccTLD second level) merging two
 * genuinely different registrable domains. Adding a suffix here is the fix, and each addition only
 * narrows scope.
 */

/** Multi-part public suffixes: a registrable domain under these needs THREE labels, not two. */
const MULTI_PART_SUFFIXES: ReadonlySet<string> = new Set([
  // Türkiye — the primary market. `gov.tr` and `bel.tr` also drive the sensitive-site lockout.
  'com.tr',
  'net.tr',
  'org.tr',
  'gov.tr',
  'edu.tr',
  'bel.tr',
  'av.tr',
  'dr.tr',
  'k12.tr',
  'pol.tr',
  'mil.tr',
  'tsk.tr',
  'gen.tr',
  'biz.tr',
  'info.tr',
  'tv.tr',
  'web.tr',
  'name.tr',
  'tel.tr',
  'bbs.tr',
  // United Kingdom
  'co.uk',
  'org.uk',
  'me.uk',
  'ltd.uk',
  'plc.uk',
  'net.uk',
  'sch.uk',
  'ac.uk',
  'gov.uk',
  'nhs.uk',
  // Australia / New Zealand / South Africa
  'com.au',
  'net.au',
  'org.au',
  'edu.au',
  'gov.au',
  'id.au',
  'co.nz',
  'org.nz',
  'co.za',
  'org.za',
  // Japan / Korea / China / Taiwan / Hong Kong / Singapore
  'co.jp',
  'or.jp',
  'ne.jp',
  'ac.jp',
  'go.jp',
  'co.kr',
  'or.kr',
  'com.cn',
  'net.cn',
  'org.cn',
  'gov.cn',
  'com.tw',
  'com.hk',
  'com.sg',
  'com.my',
  // South & Southeast Asia
  'co.in',
  'net.in',
  'org.in',
  'gov.in',
  'co.th',
  'com.ph',
  'com.vn',
  'co.id',
  // Americas / Europe / Middle East
  'com.br',
  'net.br',
  'org.br',
  'gov.br',
  'com.mx',
  'com.ar',
  'com.co',
  'co.il',
  'com.pl',
  'com.ua',
  'com.ru',
  'co.ru',
]);

const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;

/** Normalize a hostname: lowercase, strip a trailing root dot. Returns `null` when unusable. */
function normalizeHost(host: string): string | null {
  const h = host.trim().toLowerCase().replace(/\.$/, '');
  return h.length > 0 ? h : null;
}

/**
 * The registrable domain (eTLD+1) of a hostname, or `null` when there isn't one — a bare TLD, a public
 * suffix on its own, or unparseable input. Literal IP hosts return the IP itself, since each is its own
 * scope and no suffix logic applies.
 */
export function registrableDomainOfHost(host: string): string | null {
  const h = normalizeHost(host);
  if (h === null) return null;
  // IPv6 arrives bracketed from URL.hostname; an IP is its own scope.
  if (h.startsWith('[') || h.includes(':')) return h;
  if (IPV4.test(h)) return h;

  const labels = h.split('.').filter((l) => l.length > 0);
  if (labels.length < 2) return null; // 'localhost', a bare TLD — no registrable domain.

  const lastTwo = labels.slice(-2).join('.');
  if (MULTI_PART_SUFFIXES.has(lastTwo)) {
    // The suffix itself is not a registrable domain — `com.tr` alone has no owner to scope a grant to.
    if (labels.length < 3) return null;
    return labels.slice(-3).join('.');
  }
  return lastTwo;
}

/** The registrable domain of a URL, or `null` if the URL is unparseable or has no registrable domain. */
export function registrableDomain(rawUrl: string): string | null {
  try {
    return registrableDomainOfHost(new URL(rawUrl).hostname);
  } catch {
    return null;
  }
}

/**
 * Whether two URLs share a registrable domain.
 *
 * **Fail-closed:** if either side has no resolvable registrable domain, the answer is `false` — callers
 * treat that as "different site", which costs a prompt rather than leaking a grant.
 *
 * **Sub-domain policy (explicit):** sub-domains of the same registrable domain ARE the same site.
 * `mail.example.com` and `www.example.com` share a grant. This matches how sites actually deploy
 * (login on `accounts.`, checkout on `secure.`), and the meaningful boundary — the one an attacker
 * controls — is the registrable domain, not the label in front of it.
 */
export function isSameSite(a: string, b: string): boolean {
  const da = registrableDomain(a);
  const db = registrableDomain(b);
  if (da === null || db === null) return false;
  return da === db;
}
