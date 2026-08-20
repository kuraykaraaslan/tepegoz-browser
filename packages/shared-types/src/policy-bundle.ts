import { z } from 'zod';

/**
 * A Verifiable Policy Bundle (Phase 9, "constitution-as-code") — a signed, versioned scope a user or an
 * org can install. What makes a bundle worth trusting is not the signature alone; it is that a CHILD
 * bundle can never widen a PARENT it derives from, checked deterministically at compile time
 * (`bundleNarrows` below) rather than trusted because a publisher claims it. This schema is the shape
 * that check operates on.
 */
export const PolicyBundleSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(200),
  version: z.string().min(1).max(40),
  /** Tool ids this bundle permits. A bundle with no entries permits nothing — never "everything not
   *  explicitly forbidden". */
  allowedToolIds: z.array(z.string().min(1).max(100)),
  /** Registrable domains this bundle permits acting on. `null` means "no domain restriction beyond
   *  whatever the tools themselves already require" — deliberately distinct from an EMPTY array, which
   *  would mean "no domain is permitted" and is a stricter, different claim. */
  allowedDomains: z.array(z.string().min(1).max(255)).nullable(),
  /** The bundle this one derives from, if any. A bundle with no parent is a root — everything it grants
   *  is its own to grant; only a CHILD is constrained to never exceed what its parent already permits. */
  parentId: z.string().uuid().optional(),
});
export type PolicyBundle = z.infer<typeof PolicyBundleSchema>;
