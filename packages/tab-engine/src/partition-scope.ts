/**
 * Process-wide profile scope for Chromium session-partition names (ADR-0045,
 * `docs/tracks/multi-profile-isolation.md`).
 *
 * Under process-per-profile each profile runs as its own Electron instance over its own `userData`
 * directory, so a partition is ALREADY isolated per profile by the directory it lives in. Baking the
 * profile id into the partition NAME on top of that is defense-in-depth, and an explicit owner
 * decision: two profiles can never be made to share a partition even if a future refactor got the
 * process boundary wrong.
 *
 * The scope is set ONCE, at boot, before any partition is materialized into a `Session`, and is then
 * constant for the process's lifetime. Empty string = the pre-multi-profile spelling
 * (`persist:tepegoz-web` / `persist:tepegoz-app`), which is what tests and an explicit
 * `--user-data-dir` override that opts out of the profile system get.
 */

let scope = '';

/** Set the profile scope for every partition name this process builds. Call once, at boot. */
export function setProfilePartitionScope(profileId: string): void {
  scope = profileId;
}

/** The current profile scope, or `''` when unset (pre-multi-profile spelling). */
export function profilePartitionScope(): string {
  return scope;
}

/** Test seam — restore the unset state. */
export function resetProfilePartitionScope(): void {
  scope = '';
}

/**
 * The Direct (untunneled) browsing partition for this process's profile. Phase 5 derives every
 * `--conn-<id>` tunnel partition, and `privatePartitionKey` its private siblings, from this base.
 *
 * Scoped: `persist:tepegoz-profile-<id>`. Unset: `persist:tepegoz-web` — byte-identical to the
 * pre-Phase-5 / pre-multi-profile name, so a test or an opted-out run reads the same partition it
 * always did.
 */
export function directBrowsingPartition(): string {
  return scope.length > 0 ? `persist:tepegoz-profile-${scope}` : 'persist:tepegoz-web';
}

/**
 * The app-chrome partition (main window + extension popups + `tepegoz://` internal pages — all trusted
 * chrome). Scoped: `persist:tepegoz-profile-<id>--app`. Unset: `persist:tepegoz-app`.
 *
 * The `--app` suffix rides on the same base as the browsing partition on purpose (ADR-0045): Phase 5's
 * `persist:tepegoz-profile-<id>--conn-<connId>` tunnels compose on the bare base without a later
 * rename. Nothing may test browsing-partition membership with a bare `startsWith(base)` — that would
 * also match `base--app`; the Direct check is exact and the tunnel check is `startsWith(base + '--conn-')`.
 */
export function appChromePartition(): string {
  return scope.length > 0 ? `persist:tepegoz-profile-${scope}--app` : 'persist:tepegoz-app';
}
