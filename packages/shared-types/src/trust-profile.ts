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

/**
 * `trust-profiles:import` per-entry schema — domain + level, and nothing else.
 *
 * Deliberately narrower than {@link TrustProfileSchema}: `id`/`deviceId`/`updatedAt`/`version`/
 * `tombstone` never travel in an import file, because an imported entry is never written directly —
 * it is applied through the exact same `TrustProfileStore.put` write path (via the main-process
 * `setTrustProfile`) that the Settings → Privacy → Site trust screen already uses for a manual level
 * change. That path mints its own fresh id, device id, timestamp, and version, exactly as if the user
 * had typed the domain in by hand. Carrying over another install's sync metadata would be pointless
 * (this install has its own device id) and, for `updatedAt`/`version`, actively wrong — a permission
 * record's ordering should reflect when THIS install decided it, not when some other install did.
 *
 * The domain pattern mirrors `TrustDomainSchema` (`@tepegoz/desktop-ipc`), the same regex the manual
 * "Add"/"Update" form posts after normalizing the typed host to punycode — an import file is expected
 * to already hold that normalized form, since it can only realistically have come from a previous
 * export of this same screen.
 */
export const TrustProfileImportEntrySchema = z.object({
  domain: z
    .string()
    .min(1)
    .max(255)
    .regex(/^[a-z0-9-]+(\.[a-z0-9-]+)+$/, 'a lowercase registrable domain'),
  level: TrustLevelEnum,
});
export type TrustProfileImportEntry = z.infer<typeof TrustProfileImportEntrySchema>;

/**
 * Outcome of a trust-profiles import (Settings → Privacy → Site trust → Import). Every entry in the
 * imported file is validated on its own against {@link TrustProfileImportEntrySchema}: `imported`
 * counts the ones that passed and were applied (upsert on domain, via the same write path a manual
 * level change uses), `skipped` counts the entries dropped because they are not a valid trust-profile
 * entry. Mirrors `TasksImportResult`/`MacrosImportResult`.
 */
export interface TrustProfilesImportResult {
  imported: number;
  skipped: number;
}
