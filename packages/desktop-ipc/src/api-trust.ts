import type {
  TrustLevel,
  TrustProfile,
  TrustProfilesImportResult,
} from '@tepegoz/shared-types';

/**
 * Scoped Trust Profiles over the bridge.
 *
 * The renderer names a domain and a level. It never says what a level means — `applyTrust` in the
 * Policy Kernel does, in main, and its one invariant is that a profile can only tighten. That split is
 * the point: the settings screen is a way to express a preference, not a way to grant a permission.
 */
export interface TrustApi {
  listTrustProfiles(): Promise<TrustProfile[]>;
  /** Set (or replace) a site's level, and return the resulting list. */
  setTrustProfile(domain: string, level: TrustLevel): Promise<TrustProfile[]>;
  /** Remove a site's profile — it goes back to `default`. Returns the resulting list. */
  removeTrustProfile(domain: string): Promise<TrustProfile[]>;
  /** Every live profile's domain + level (no sync metadata, no tombstoned rows) as one JSON string for
   *  the user to save. */
  exportTrustProfiles(): Promise<string>;
  /** Restore profiles from a previously exported JSON string; invalid entries are skipped, not fatal.
   *  Every entry is applied through the same `setTrustProfile` a manual level change uses, so the
   *  tighten-only invariant applies identically to an imported one. */
  importTrustProfiles(json: string): Promise<TrustProfilesImportResult>;
}
