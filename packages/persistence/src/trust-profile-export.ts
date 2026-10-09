import {
  TrustProfileImportEntrySchema,
  type TrustProfile,
  type TrustProfileImportEntry,
} from '@tepegoz/shared-types';

/**
 * Serialize + parse the user's SCOPED TRUST PROFILES for a user-initiated backup — the trust-profiles
 * counterpart of {@link serializeTasksJson}/{@link parseTasksImport} (`./task-export`): same envelope
 * shape, same "validate every entry on its own, skip what fails" discipline.
 *
 * WHAT TRAVELS, ON PURPOSE: the reusable, portable part of a profile — the domain and the level
 * (trusted/default/restricted). Nothing else in the row is reusable data:
 *
 *  - `id`/`deviceId`/`updatedAt`/`version` are sync metadata for THIS install's own copy of the row.
 *    They are meaningless (or actively misleading — a stale `updatedAt`) on another install, and they
 *    are never needed: import applies each entry through `TrustProfileStore.put` (via the main-process
 *    `setTrustProfile`), the SAME write path a manual level change already uses, which mints its own
 *    fresh id/device id/timestamp/version — exactly as if the user had typed the domain in by hand.
 *  - A tombstoned (revoked) row never travels as a live entry. `TrustProfileStore.list` already only
 *    returns live rows, so a plain export of `list()`'s result naturally excludes them; this module
 *    filters defensively too; a site the user removed from the list must not reappear as trusted (or
 *    any other level) on another install just because it once had a row here.
 *
 * WHY IMPORT REUSES THE SAME WRITE PATH, NOT A PARALLEL ONE: a trust profile is a security setting,
 * not inert data — `applyTrust` (`@tepegoz/security-policy`) enforces "a profile can only ever
 * tighten" (a `deny` stays `deny`; `destructive`/`financial` risk and tainted arguments always keep
 * their prompt) entirely downstream of WHAT level is stored, never of HOW it got there. Because import
 * calls the exact same `setTrustProfile` the Settings screen calls, every guarantee that already
 * applies to a hand-set level — the tighten-only invariant, and the kernel's immediate re-publish so
 * the change takes effect on the very next policy decision rather than at the next launch — applies
 * identically to an imported one. This is also why a `trusted` entry needs no extra gate here: the
 * Settings screen itself has no confirmation step beyond posting `{ domain, level }` (see
 * `settings-site-trust.tsx`), so there is no manual-only safeguard for import to bypass by reusing the
 * same path.
 */

export const TRUST_PROFILES_EXPORT_FORMAT = 'tepegoz.trust-profiles';
/** Envelope schema version — bumped only if the *file wrapper* changes, not the per-entry shape. */
export const TRUST_PROFILES_EXPORT_VERSION = 1;

export interface TrustProfilesExportFile {
  format: typeof TRUST_PROFILES_EXPORT_FORMAT;
  version: number;
  profiles: TrustProfileImportEntry[];
}

function toExportEntry(profile: TrustProfile): TrustProfileImportEntry {
  return { domain: profile.domain, level: profile.level };
}

/** Every LIVE trust profile as one pretty-printed JSON document (stable key order, newline-terminated).
 *  Filters out any tombstoned row defensively, even though callers are expected to already hand over
 *  only `TrustProfileStore.list`'s (live-only) result. */
export function serializeTrustProfilesJson(profiles: readonly TrustProfile[]): string {
  const file: TrustProfilesExportFile = {
    format: TRUST_PROFILES_EXPORT_FORMAT,
    version: TRUST_PROFILES_EXPORT_VERSION,
    profiles: profiles.filter((p) => !p.tombstone).map(toExportEntry),
  };
  return `${JSON.stringify(file, null, 2)}\n`;
}

/**
 * Split a previously exported trust-profiles file into the entries that can be re-applied and a count
 * of the ones that cannot.
 *
 * The file is untrusted (hand-edited, from an older build, or not a trust-profiles file at all), so
 * every entry is checked on its own against {@link TrustProfileImportEntrySchema}. An entry the schema
 * rejects is dropped and counted in `skipped` rather than failing the whole import — one bad row
 * should not cost the user the other nine that are fine.
 *
 * Accepts either the `{ format, version, profiles }` envelope this app writes or a bare JSON array of
 * entries (so a hand-assembled list still imports). A file that is not JSON, or is JSON with no
 * profiles list at all, is rejected outright with a {@link SyntaxError} — there is nothing to apply.
 */
export function parseTrustProfilesImport(json: string): {
  profiles: TrustProfileImportEntry[];
  skipped: number;
} {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    throw new SyntaxError('Trust profiles import is not valid JSON.');
  }

  let list: unknown;
  if (Array.isArray(raw)) {
    list = raw;
  } else if (
    typeof raw === 'object' &&
    raw !== null &&
    Array.isArray((raw as TrustProfilesExportFile).profiles)
  ) {
    list = (raw as TrustProfilesExportFile).profiles;
  } else {
    throw new SyntaxError(
      'Trust profiles import must be a JSON array or an export file with a "profiles" array.',
    );
  }

  const profiles: TrustProfileImportEntry[] = [];
  let skipped = 0;
  for (const entry of list as unknown[]) {
    const parsed = TrustProfileImportEntrySchema.safeParse(entry);
    if (parsed.success) profiles.push(parsed.data);
    else skipped += 1;
  }
  return { profiles, skipped };
}
