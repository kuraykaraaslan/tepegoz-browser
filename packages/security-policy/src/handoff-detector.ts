/**
 * Human-handoff detection (L3 Human Handoff Controller). Deterministic, rule-based scan of perceived
 * page text (+ optional URL) for a CAPTCHA or a two-factor / one-time-code challenge. When one is
 * found the orchestrator halts the agent loop and hands control back to the human — the agent NEVER
 * attempts to solve it (no auto-solve; credit is preserved). Determinism-first: the model is not asked
 * "is this a CAPTCHA?"; a keyword match on the already-sanitized text is enough and is replayable.
 *
 * Precision matters as much as recall. A naive substring scan over-matches badly: the perceived text
 * includes hrefs/asset URLs whose hex fingerprints routinely contain the hex triple `2fa` (e.g.
 * `chunks/fa323fb3462fa0c7.js`), and ordinary articles/docs *mention* "2FA"/"OTP"/"security code" as a
 * topic. Either would fire a bogus "finish signing in yourself" handoff that aborts a legitimate
 * read-only task (e.g. "count the blog posts on this page"). So matching here is deliberately tightened:
 *   • token-boundary matching (a marker must be a standalone token, never a substring of a hash/word);
 *   • a two-tier vocabulary — STRONG phrases that are challenge-specific on their own, and WEAK/ambiguous
 *     tokens (`2fa`, `otp`, `security code`, …) that only count when a challenge/input CUE ("enter",
 *     "we sent", "authenticator", …) sits right next to them.
 * Real challenge pages almost always carry a strong phrase, so recall stays high while topical mentions
 * and hex noise stop tripping the wall. Pure — no I/O, no Electron.
 */
export const HANDOFF_KINDS = ['captcha', 'twofa'] as const;
export type HandoffKind = (typeof HANDOFF_KINDS)[number];

export interface HandoffSignal {
  kind: HandoffKind;
  /** The literal phrase that matched — for the audit trail / debug, never shown raw to the user. */
  matched: string;
}

/**
 * CAPTCHA challenge markers — strong on their own (provider hostnames that appear in embedded
 * iframe/script URLs, plus widget copy). None occurs inside a hex fingerprint, so a token-boundary
 * match is safe. `captcha` is kept strong (not cue-gated) so a challenge that only labels itself
 * "CAPTCHA" is still caught, and so CAPTCHA keeps precedence over a co-located 2FA phrase.
 */
const CAPTCHA_STRONG: readonly string[] = [
  'recaptcha',
  'hcaptcha',
  'turnstile',
  "i'm not a robot",
  'i am not a robot',
  'verify you are human',
  'verify you are a human',
  'confirm you are human',
  'confirm you are a human',
  'are you a robot',
  'complete the captcha',
  'captcha',
  // Cloudflare / bot-wall interstitials — distinctive fixed copy, no keyword but human-gating.
  'checking your browser',
  'review the security of your connection',
];

/** Two-factor / one-time-code markers that are challenge-specific enough to fire on their own. */
const TWOFA_STRONG: readonly string[] = [
  'one-time code',
  'one time code',
  'one-time password',
  'one-time passcode',
  'one time passcode',
  'verification code',
  'authentication code',
  'enter the code',
  'authenticator app',
  'code we sent',
  'code sent to your',
];

/**
 * Ambiguous 2FA tokens — they show up as ARTICLE/UI topic words ("how 2FA works", a CVV "security
 * code", "save your backup codes") and, for `2fa`, inside hex asset hashes. They only signal a handoff
 * when a challenge/input cue sits within {@link CUE_WINDOW} characters, i.e. the page is actually asking
 * the user to act — not merely discussing the concept.
 */
const TWOFA_WEAK: readonly string[] = [
  '2fa',
  'otp',
  'two-factor',
  'two factor',
  'security code',
  'passcode',
  'backup code',
  'backup codes',
];

/**
 * Imperative/input cues that distinguish an actual challenge from a topical mention. Split into small
 * alternations (kept simple on purpose) and tested together via {@link hasCue}.
 */
const CHALLENGE_CUES: readonly RegExp[] = [
  /\b(?:enter|type|input|paste|submit|provide|complete)\b/i,
  /\b(?:verify|verifying|confirm|authenticat\w*)\b/i,
  /\b(?:we\s+sent|sent\s+to|check\s+your|from\s+your|on\s+your|to\s+your)\b/i,
  /\b(?:6[-\s]?digit|digit\s+code)\b/i,
];
const hasCue = (s: string): boolean => CHALLENGE_CUES.some((re) => re.test(s));

/** How far from a weak token a challenge cue may sit and still count (each side). */
const CUE_WINDOW = 64;

const escapeRegExp = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);

/**
 * Build a token-boundary matcher for a marker: it must NOT be flanked by a Unicode letter/digit, so
 * `2fa` matches "enter your 2FA code" but not "…3462fa0c7.js" (hex triple) and not "l2fappx". Boundaries
 * use `\p{L}\p{N}` (not ASCII `[a-z0-9]`) so a marker glued to a non-ASCII letter — e.g. Turkish
 * `güvenlik2fa` — is still rejected. Internal spaces/hyphens in multi-word markers are literal;
 * boundaries are asserted only at the two ends. No `i` flag needed: the haystack is pre-lowercased.
 */
const boundaried = (marker: string): RegExp =>
  new RegExp(String.raw`(?<![\p{L}\p{N}])${escapeRegExp(marker)}(?![\p{L}\p{N}])`, 'gu');

/** The first marker whose token-boundary form occurs in `haystack`, or undefined. */
function firstStrong(haystack: string, markers: readonly string[]): string | undefined {
  return markers.find((m) => boundaried(m).test(haystack));
}

/** The first weak marker that occurs as a token AND has a challenge cue within {@link CUE_WINDOW}. */
function firstWeakWithCue(haystack: string, markers: readonly string[]): string | undefined {
  for (const marker of markers) {
    for (const match of haystack.matchAll(boundaried(marker))) {
      const at = match.index;
      const window = haystack.slice(Math.max(0, at - CUE_WINDOW), at + marker.length + CUE_WINDOW);
      if (hasCue(window)) return marker;
    }
  }
  return undefined;
}

/**
 * Scan perceived (sanitized) page text and an optional URL for a handoff trigger. Returns the first
 * signal found (CAPTCHA takes precedence over 2FA), or `null` when nothing matches.
 */
export function detectHandoff(text: string, url?: string): HandoffSignal | null {
  const haystack = `${text} ${url ?? ''}`.toLowerCase();
  if (haystack.trim().length === 0) return null;

  const captcha = firstStrong(haystack, CAPTCHA_STRONG);
  if (captcha !== undefined) return { kind: 'captcha', matched: captcha };

  const twofaStrong = firstStrong(haystack, TWOFA_STRONG);
  if (twofaStrong !== undefined) return { kind: 'twofa', matched: twofaStrong };

  const twofaWeak = firstWeakWithCue(haystack, TWOFA_WEAK);
  if (twofaWeak !== undefined) return { kind: 'twofa', matched: twofaWeak };

  return null;
}
