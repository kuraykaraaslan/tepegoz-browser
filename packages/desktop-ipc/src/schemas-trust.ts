import { z } from 'zod';
import { TrustLevelEnum } from '@tepegoz/shared-types';

/**
 * The untrusted direction for Scoped Trust Profiles.
 *
 * The domain pattern is the load-bearing part. Main matches a profile on the registrable domain, so a
 * renderer that could store `https://github.com/` or `GitHub.com` as the key would be storing a row
 * that either never matches or matches something else — and for a permission record, a row that
 * silently never applies is worse than a rejected one, because the settings screen still shows it.
 */
export const TrustDomainSchema = z
  .string()
  .min(1)
  .max(255)
  .regex(/^[a-z0-9-]+(\.[a-z0-9-]+)+$/, 'a lowercase registrable domain');

export const TrustProfileSetSchema = z.object({
  domain: TrustDomainSchema,
  level: TrustLevelEnum,
});

/**
 * `trust-profiles:import` payload — the raw JSON text of a previously exported trust-profiles file.
 * Bounded like the tasks/macros counterparts (`TasksImportJsonSchema`/`MacrosImportJsonSchema`); the
 * handler `JSON.parse`s it and validates every entry against `TrustProfileImportEntrySchema`
 * individually (`@tepegoz/shared-types`).
 */
export const TrustProfilesImportJsonSchema = z.string().max(10_485_760);
