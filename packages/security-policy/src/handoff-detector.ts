/**
 * Human-handoff detection (L3 Human Handoff Controller). Deterministic, rule-based scan of perceived
 * page text (+ optional URL) for a CAPTCHA or a two-factor / one-time-code challenge. When one is
 * found the orchestrator halts the agent loop and hands control back to the human — the agent NEVER
 * attempts to solve it (no auto-solve; credit is preserved). Determinism-first: the model is not asked
 * "is this a CAPTCHA?"; a keyword match on the already-sanitized text is enough and is replayable.
 *
 * Over-matching is the safe direction (a false handoff just asks the human; a missed one lets the
 * agent flail against a wall it cannot pass). Pure — no I/O, no Electron.
 */
export const HANDOFF_KINDS = ['captcha', 'twofa'] as const;
export type HandoffKind = (typeof HANDOFF_KINDS)[number];

export interface HandoffSignal {
  kind: HandoffKind;
  /** The literal phrase that matched — for the audit trail / debug, never shown raw to the user. */
  matched: string;
}

/** CAPTCHA challenge markers (widget copy + provider hostnames that appear in embedded URLs/text). */
const CAPTCHA_PATTERNS: readonly string[] = [
  'recaptcha',
  'hcaptcha',
  'turnstile',
  "i'm not a robot",
  'i am not a robot',
  'verify you are human',
  'verify you are a human',
  'are you a robot',
  'complete the captcha',
  'captcha',
];

/** Two-factor / one-time-code challenge markers. */
const TWOFA_PATTERNS: readonly string[] = [
  'two-factor',
  'two factor',
  '2fa',
  'one-time code',
  'one time code',
  'one-time password',
  'verification code',
  'authentication code',
  'security code',
  'enter the code',
  'authenticator app',
  'code we sent',
  'code sent to your',
  'otp',
];

function firstMatch(haystack: string, patterns: readonly string[]): string | undefined {
  return patterns.find((p) => haystack.includes(p));
}

/**
 * Scan perceived (sanitized) page text and an optional URL for a handoff trigger. Returns the first
 * signal found (CAPTCHA takes precedence over 2FA), or `null` when nothing matches.
 */
export function detectHandoff(text: string, url?: string): HandoffSignal | null {
  const haystack = `${text} ${url ?? ''}`.toLowerCase();
  if (haystack.trim().length === 0) return null;

  const captcha = firstMatch(haystack, CAPTCHA_PATTERNS);
  if (captcha !== undefined) return { kind: 'captcha', matched: captcha };

  const twofa = firstMatch(haystack, TWOFA_PATTERNS);
  if (twofa !== undefined) return { kind: 'twofa', matched: twofa };

  return null;
}
