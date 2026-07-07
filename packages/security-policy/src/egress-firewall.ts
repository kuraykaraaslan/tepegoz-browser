/**
 * Egress Firewall (L8, TypeScript v1 — moves to Rust in Phase 1b). Inspects OUTBOUND payloads the
 * agent is about to send off-device (model requests carrying page data, network tool calls, form
 * submissions) and blocks/flags exfiltration:
 *  - secret tokens & private keys (provider API keys, Bearer, JWT, AWS/GitHub/Google) → BLOCK
 *  - encoded blobs: long Base64 runs / high-Shannon-entropy tokens (data smuggling) → WARN
 *  - PII: email / IBAN / Luhn-valid card numbers → WARN
 *
 * Detection is intrinsic to the payload (origin-aware cross-origin policy layers on top later). Over-
 * flagging is the safe direction. Samples in findings are REDACTED — the raw secret is never echoed
 * into a finding, log, or audit record.
 */
export const EGRESS_FINDING_KINDS = [
  'secret_token',
  'private_key',
  'base64_blob',
  'high_entropy',
  'pii_email',
  'pii_card',
  'pii_iban',
] as const;
export type EgressFindingKind = (typeof EGRESS_FINDING_KINDS)[number];

export type EgressSeverity = 'block' | 'warn';
export type EgressDecision = 'allow' | 'warn' | 'block';

export interface EgressFinding {
  kind: EgressFindingKind;
  severity: EgressSeverity;
  /** Redacted, length-annotated sample — NEVER the raw secret. */
  sample: string;
}

export interface EgressVerdict {
  decision: EgressDecision;
  findings: EgressFinding[];
}

interface PatternRule {
  kind: EgressFindingKind;
  severity: EgressSeverity;
  re: RegExp;
}

// Order matters only for readability; matchAll is independent per rule. All use the global flag.
// Vendor-prefixed rules are high-confidence (low false-positive) so they are safe to BLOCK. Enumeration
// necessarily lags real-world formats, so the model-egress path routes a block to HITL (never a silent
// send), and unmatched-but-suspicious tokens still surface as high_entropy/base64_blob 'warn' below.
const SECRET_RULES: readonly PatternRule[] = [
  { kind: 'private_key', severity: 'block', re: /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/g },
  { kind: 'secret_token', severity: 'block', re: /\bsk-ant-[A-Za-z0-9_-]{20,}/g },
  { kind: 'secret_token', severity: 'block', re: /\bsk-[A-Za-z0-9]{20,}\b/g },
  // Stripe secret + restricted keys use an UNDERSCORE (the sk- rule above never matches them).
  { kind: 'secret_token', severity: 'block', re: /\b[rs]k_(?:live|test)_[A-Za-z0-9]{16,}/g },
  { kind: 'secret_token', severity: 'block', re: /\bAKIA[0-9A-Z]{16}\b/g },
  { kind: 'secret_token', severity: 'block', re: /\bgh[pousr]_[A-Za-z0-9]{36,}\b/g },
  // GitHub fine-grained PAT (github_pat_...) — distinct prefix from the classic gh[pousr]_ tokens.
  { kind: 'secret_token', severity: 'block', re: /\bgithub_pat_\w{22,}/g },
  // Slack bot/user/app/refresh tokens.
  { kind: 'secret_token', severity: 'block', re: /\bxox[bpasr]-[A-Za-z0-9-]{10,}/g },
  // SendGrid API key (SG.<id>.<secret>).
  { kind: 'secret_token', severity: 'block', re: /\bSG\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}/g },
  { kind: 'secret_token', severity: 'block', re: /\bAIza[0-9A-Za-z_-]{35,}/g },
  { kind: 'secret_token', severity: 'block', re: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g },
  { kind: 'secret_token', severity: 'block', re: /\bBearer\s+[A-Za-z0-9._-]{20,}/gi },
];

const PII_RULES: readonly PatternRule[] = [
  { kind: 'pii_email', severity: 'warn', re: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g },
  { kind: 'pii_iban', severity: 'warn', re: /\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/g },
];

const CARD_CANDIDATE = /\d(?:[ -]?\d){12,18}/g;
const BASE64_RUN = /[A-Za-z0-9+/]{40,}={0,2}/g;
const TOKEN_SPLIT = /[\s,"'`<>(){}[\]]+/;
const MIN_ENTROPY_LEN = 24;
const HIGH_ENTROPY_BITS = 4.0;

/** Redact a matched secret/PII slice: keep a 4-char head, annotate length, drop the rest. */
function redact(sample: string): string {
  const head = sample.slice(0, 4);
  return `${head}…(${String(sample.length)} chars)`;
}

/** Shannon entropy in bits/char — high values flag random/encoded data. */
export function shannonEntropy(input: string): number {
  if (input.length === 0) return 0;
  const counts = new Map<string, number>();
  for (const ch of input) counts.set(ch, (counts.get(ch) ?? 0) + 1);
  let entropy = 0;
  for (const count of counts.values()) {
    const p = count / input.length;
    entropy -= p * Math.log2(p);
  }
  return entropy;
}

function luhnValid(digits: string): boolean {
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}

function scanPatterns(payload: string, rules: readonly PatternRule[], out: EgressFinding[]): void {
  for (const rule of rules) {
    for (const match of payload.matchAll(rule.re)) {
      out.push({ kind: rule.kind, severity: rule.severity, sample: redact(match[0]) });
    }
  }
}

function scanCards(payload: string, out: EgressFinding[]): void {
  for (const match of payload.matchAll(CARD_CANDIDATE)) {
    const digits = match[0].replace(/\D/g, '');
    if (digits.length >= 13 && digits.length <= 19 && luhnValid(digits)) {
      out.push({ kind: 'pii_card', severity: 'warn', sample: redact(digits) });
    }
  }
}

function scanBlobs(payload: string, out: EgressFinding[]): void {
  // Long contiguous Base64 runs anywhere (incl. glued to `key=` or inside URLs/JSON).
  for (const match of payload.matchAll(BASE64_RUN)) {
    out.push({ kind: 'base64_blob', severity: 'warn', sample: redact(match[0]) });
  }
  // High-entropy tokens NOT already covered by a Base64 run (random keys/ids/encoded data).
  for (const token of payload.split(TOKEN_SPLIT)) {
    if (token.length < MIN_ENTROPY_LEN) continue;
    if (BASE64_RUN.test(token)) {
      BASE64_RUN.lastIndex = 0; // global regex: reset state after a .test()
      continue;
    }
    if (shannonEntropy(token) >= HIGH_ENTROPY_BITS) {
      out.push({ kind: 'high_entropy', severity: 'warn', sample: redact(token) });
    }
  }
}

/** Inspect an outbound payload for exfiltration signals. Pure; no I/O. */
export function inspectEgress(payload: string): EgressVerdict {
  const findings: EgressFinding[] = [];
  scanPatterns(payload, SECRET_RULES, findings);
  scanPatterns(payload, PII_RULES, findings);
  scanCards(payload, findings);
  scanBlobs(payload, findings);

  const decision: EgressDecision = findings.some((f) => f.severity === 'block')
    ? 'block'
    : findings.length > 0
      ? 'warn'
      : 'allow';
  return { decision, findings };
}

/** Deterministic egress check (L8). Static, pure — the boundary maps the verdict to allow/HITL/deny. */
export default class EgressFirewall {
  static inspect(payload: string): EgressVerdict {
    return inspectEgress(payload);
  }

  /** True when the payload must be blocked outright (a hard secret/key leak). */
  static isBlocked(payload: string): boolean {
    return inspectEgress(payload).decision === 'block';
  }
}
