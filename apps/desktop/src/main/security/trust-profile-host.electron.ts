import { PolicyKernel } from '@tepegoz/security-policy';
import { TrustProfileStore, serializeTrustProfilesJson } from '@tepegoz/persistence';
import { Logger } from '@tepegoz/libs';
import type { TrustLevel, TrustProfile, TrustProfileImportEntry } from '@tepegoz/shared-types';
import { getDb } from '../db/database.electron';

/**
 * The main-process half of Scoped Trust Profiles: the DB rows, loaded into the Policy Kernel.
 *
 * The kernel holds the profiles in memory rather than querying per decision, so every write here
 * re-publishes the whole set. That is deliberate — a policy decision must not be able to block on IO or
 * to differ because a read failed halfway through a run, and the set is a handful of rows.
 *
 * When the database is unavailable the kernel keeps an EMPTY set, which is `default` everywhere: the
 * degraded state is the one that asks, never the one that assumes a site was trusted.
 */

function publish(): TrustProfile[] {
  const db = getDb();
  if (db === null) {
    PolicyKernel.setTrustProfiles([]);
    return [];
  }
  const profiles = TrustProfileStore.list(db);
  PolicyKernel.setTrustProfiles(
    profiles.map((p) => ({ domain: p.domain, level: p.level, tombstone: p.tombstone })),
  );
  return profiles;
}

/** Load the stored profiles into the kernel at startup, before any tab can ask for a tool. */
export function initTrustProfiles(): void {
  const loaded = publish();
  if (loaded.length > 0) Logger.info('Trust profiles loaded', { count: loaded.length });
}

export function listTrustProfiles(): TrustProfile[] {
  const db = getDb();
  return db === null ? [] : TrustProfileStore.list(db);
}

export function setTrustProfile(domain: string, level: TrustLevel): TrustProfile[] {
  const db = getDb();
  if (db === null) return [];
  TrustProfileStore.put(db, domain, level);
  // Re-publish immediately: a setting the user just changed must apply to the next decision, not to
  // the next launch. A permission UI whose effect is deferred is one people stop believing.
  return publish();
}

export function removeTrustProfile(domain: string): TrustProfile[] {
  const db = getDb();
  if (db === null) return [];
  TrustProfileStore.remove(db, domain);
  return publish();
}

/** Every LIVE trust profile's domain + level as one JSON document, for a user-initiated backup. */
export function exportTrustProfilesJson(): string {
  const db = getDb();
  return serializeTrustProfilesJson(db === null ? [] : TrustProfileStore.list(db));
}

/**
 * Apply a batch of already-validated import entries through the EXACT same {@link setTrustProfile}
 * used by a manual Settings → Privacy → Site trust level change — never `TrustProfileStore.put`
 * directly. That is what makes the tighten-only invariant (`applyTrust`, `@tepegoz/security-policy`)
 * and the immediate kernel re-publish apply identically to an imported entry: `setTrustProfile` is the
 * one function that does both, and an imported row asks it to do exactly what the Settings screen asks
 * it to do — set this domain to this level — nothing about it is a different code path.
 *
 * Returns how many were written; the caller (`registerTrustIpc`) already parsed + validated the
 * untrusted file with `parseTrustProfilesImport` first — this only applies the writes.
 */
export function importTrustProfiles(entries: readonly TrustProfileImportEntry[]): number {
  for (const entry of entries) setTrustProfile(entry.domain, entry.level);
  return entries.length;
}
