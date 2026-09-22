import type { Resources } from './locales/en';

/**
 * Look up a Policy Kernel reason code's localized explanation (Permission Debug's vocabulary — the
 * `permissions.*` entries in `locales/en.ts`/`locales/tr.ts`, one per code in
 * `@tepegoz/security-policy`'s `policy-reasons.ts`).
 *
 * The single lookup, used by BOTH the live HITL approval modal (`panel-modals.tsx`, a decision as it
 * happens) and the Permission Debug view (a history of past decisions) — reusing this instead of each
 * surface holding its own copy of `resources.permissions[reason]` is what keeps the two readings of a
 * reason code from drifting apart.
 *
 * Returns `null` for a code this build has no text for — an older journal entry replayed, or a code
 * from a newer policy — so an unknown reason degrades to the bare identifier rather than an empty box.
 */
export function explainPolicyReason(
  resources: Resources,
  reason: string,
): { title: string; why: string; whatYouCanDo: string } | null {
  const table = resources.permissions as Record<
    string,
    { title: string; why: string; whatYouCanDo: string }
  >;
  return table[reason] ?? null;
}
