import { registrableDomain } from './registrable-domain';

/**
 * The Kamu (Turkish public-service) lockout class (Phase 11) — e-Devlet, GİB, SGK, MHRS.
 *
 * The generic `government` category in `sensitive-site.ts` already covers the whole `gov.tr` tree and
 * gates it the way every sensitive site is gated: read → ask, state-changing → deny outright, no
 * override. That is the right default for an UNREVIEWED action on a government site. It is the wrong
 * rule for a signed, version-pinned Kamu recipe whose write step — "randevu al", "beyanname onayla" — is
 * the entire reason the recipe exists: an outright deny would make read-write Kamu automation
 * impossible, which defeats the phase's own goal ("the only agentic browser one could plausibly trust on
 * a government login").
 *
 * So this module is deliberately its own, narrower thing — NOT a change to the general sensitive-site
 * map, and not reachable by an ordinary agent action. It answers one question only: *for a step that has
 * already been identified as coming from a reviewed Kamu recipe*, is it a routine read (zero-approval)
 * or a write (which this module hard-forces to ask + biometric, regardless of what danger class the
 * step's own tool declared)? Nothing here downgrades the ordinary lockout for anything that is not
 * explicitly marked as Kamu-recipe traffic.
 */

/** The exact public-service domains this pack targets — narrower than the generic `gov.tr` suffix match,
 *  named individually because the phase names them individually (e-Devlet, GİB, SGK, MHRS) and a Kamu
 *  recipe pack has no business claiming coverage of a government domain nobody reviewed it against. */
export const KAMU_DOMAINS: readonly string[] = [
  'turkiye.gov.tr', // e-Devlet
  'gib.gov.tr', // Gelir İdaresi Başkanlığı (tax)
  'sgk.gov.tr', // Sosyal Güvenlik Kurumu (social security)
  'mhrs.gov.tr', // Merkezi Hekim Randevu Sistemi (health appointments)
];

export function isKamuDomain(rawUrl: string): boolean {
  const domain = registrableDomain(rawUrl);
  if (domain === null) return false;
  return KAMU_DOMAINS.some((d) => domain.toLowerCase() === d.toLowerCase());
}

export interface KamuStepRequest {
  targetUrl: string;
  /** Whether this specific step mutates state on the portal (submits a form, confirms an appointment,
   *  approves a filing) — never inferred from the tool's own declared danger class, because the whole
   *  point is that a Kamu write must be forced to the strictest tier regardless of what a tool author
   *  happened to mark it as. */
  isStateChanging: boolean;
}

export type KamuVerdict =
  | { decision: 'allow'; reason: 'read_only_zero_approval' }
  | { decision: 'ask'; biometric: true; reason: 'kamu_write_forced_hitl' }
  | { decision: 'not_kamu' };

/**
 * Classify one step of a REVIEWED Kamu recipe. `not_kamu` is not a refusal — it is a signal to the
 * caller that this module has nothing to say about the step (wrong domain entirely) and the ordinary
 * sensitive-site / danger-class rules should decide it instead, exactly as they would for any other
 * site.
 */
export function classifyKamuStep(request: KamuStepRequest): KamuVerdict {
  if (!isKamuDomain(request.targetUrl)) return { decision: 'not_kamu' };
  if (request.isStateChanging) {
    return { decision: 'ask', biometric: true, reason: 'kamu_write_forced_hitl' };
  }
  return { decision: 'allow', reason: 'read_only_zero_approval' };
}
