/**
 * Taint / Provenance Tracker (L8). Web content — and anything the model echoes back, which could be
 * laundering injected web text — is UNTRUSTED. If any argument of a side-effecting tool call derives
 * from untrusted content, the Policy Kernel must escalate to HITL (prompt-injection containment).
 * This module computes the `taintedArgs` boolean the kernel consumes.
 *
 * v1 data-flow heuristic: an arg is tainted if a non-trivial slice of it appears verbatim inside
 * recorded untrusted content — i.e. the model lifted page text into an action. Over-tainting is the
 * SAFE direction (more HITL prompts), matching the sensitive-site lockout philosophy. Provenance is
 * tracked coarsely; precise per-value taint propagation is a later-phase refinement.
 */
export const PROVENANCE_LEVELS = ['user', 'system', 'web', 'model', 'tool'] as const;
export type Provenance = (typeof PROVENANCE_LEVELS)[number];

const UNTRUSTED_PROVENANCE: ReadonlySet<Provenance> = new Set<Provenance>(['web', 'model']);

/** Web/model-derived data is untrusted; user/system/tool-origin data is trusted. */
export function isUntrustedProvenance(provenance: Provenance): boolean {
  return UNTRUSTED_PROVENANCE.has(provenance);
}

/** Shortest arg slice treated as a meaningful taint match (avoids matching tiny common words). */
const MIN_MATCH_LEN = 12;

function normalize(text: string): string {
  return text.replace(/\s+/g, ' ').trim().toLowerCase();
}

/** Collect every string leaf in an arbitrary tool-args structure (objects / arrays / primitives). */
function collectStrings(value: unknown, out: string[]): void {
  if (typeof value === 'string') {
    out.push(value);
  } else if (Array.isArray(value)) {
    for (const item of value as unknown[]) collectStrings(item, out);
  } else if (value !== null && typeof value === 'object') {
    for (const item of Object.values(value as Record<string, unknown>)) collectStrings(item, out);
  }
}

/**
 * Return the arg string leaves that derive from any of `untrustedTexts` (verbatim slice match).
 * Exposed for Permission Debug ("which value is tainted, and why am I being asked?").
 */
export function findTaintedValues(args: unknown, untrustedTexts: readonly string[]): string[] {
  if (untrustedTexts.length === 0) return [];
  const sources = untrustedTexts.map(normalize).filter((s) => s.length > 0);
  if (sources.length === 0) return [];

  const leaves: string[] = [];
  collectStrings(args, leaves);
  return leaves.filter((leaf) => {
    const norm = normalize(leaf);
    if (norm.length < MIN_MATCH_LEN) return false;
    return sources.some((src) => src.includes(norm));
  });
}

/** True if any arg leaf derives from untrusted content — the Policy Kernel's `taintedArgs`. */
export function argsAreTainted(args: unknown, untrustedTexts: readonly string[]): boolean {
  return findTaintedValues(args, untrustedTexts).length > 0;
}

/**
 * Per-task convenience wrapper holding the untrusted-content corpus. Record web/model output as the
 * agent perceives it, then ask whether a pending tool call's args are tainted. Stateful by design
 * (one instance per task/session); the pure functions above carry the testable logic.
 */
export default class TaintTracker {
  private readonly untrusted: string[] = [];

  /** Record untrusted content (sanitized web page text, untrusted tool output) for matching. */
  record(text: string): void {
    const norm = normalize(text);
    if (norm.length > 0) this.untrusted.push(norm);
  }

  /** Record `text` only when its provenance is untrusted (web / model). */
  recordWithProvenance(text: string, provenance: Provenance): void {
    if (isUntrustedProvenance(provenance)) this.record(text);
  }

  /** The tainted arg leaves, for Permission Debug. */
  taintedValues(args: unknown): string[] {
    return findTaintedValues(args, this.untrusted);
  }

  /** Whether a pending tool call's args are tainted (feeds Policy Kernel `taintedArgs`). */
  isTainted(args: unknown): boolean {
    return argsAreTainted(args, this.untrusted);
  }

  /** Drop all recorded taint (e.g. at a task boundary). */
  clear(): void {
    this.untrusted.length = 0;
  }
}
