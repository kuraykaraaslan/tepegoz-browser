import { z } from 'zod';

/**
 * Scoped Trust Profiles — the standing posture a user sets for a site, in advance.
 *
 * The schema lives here rather than in `@tepegoz/security-policy` for the ordinary reason
 * (`@tepegoz/shared-types` is the only schema source) and one specific one: these rows cross two trust
 * boundaries — a SQLite table the user's own filesystem can reach, and an IPC channel the untrusted
 * renderer speaks. A row that arrives with `level: "admin"` must fail to parse rather than fall through
 * a comparison as "not restricted, therefore fine".
 */

/** How much the user trusts a site. Ordered from most permissive to most restrictive. */
export const TRUST_LEVELS = ['trusted', 'default', 'restricted'] as const;
export const TrustLevelEnum = z.enum(TRUST_LEVELS);
export type TrustLevel = z.infer<typeof TrustLevelEnum>;

/**
 * One site's profile.
 *
 * Carries sync metadata from the start (`updatedAt`/`version`/`tombstone`/`deviceId`, UUID primary key)
 * so cloud sync is not a schema migration later — and because a permission record specifically needs a
 * propagatable delete: a row removed outright cannot be told apart from a row that never synced, which
 * for a security setting means a revocation that quietly fails to travel.
 */
export const TrustProfileSchema = z.object({
  id: z.string().uuid(),
  /** Registrable domain (eTLD+1). Subdomains inherit; a look-alike host does not. */
  domain: z
    .string()
    .min(1)
    .max(255)
    .regex(/^[a-z0-9.-]+$/, 'a registrable domain, lowercased, no scheme or path'),
  level: TrustLevelEnum,
  deviceId: z.string().min(1).max(64),
  updatedAt: z.number().int().nonnegative(),
  version: z.number().int().positive(),
  tombstone: z.boolean(),
});
export type TrustProfile = z.infer<typeof TrustProfileSchema>;
