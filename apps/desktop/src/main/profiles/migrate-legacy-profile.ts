import { cpSync, existsSync, mkdirSync, renameSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { userInfo } from 'node:os';
import { Logger } from '@tepegoz/libs';
import { DEFAULT_PROFILE_ID } from '@tepegoz/profiles';
import ProfilesStore from '@tepegoz/profiles/store';
import { profileDir, profilesJsonPath } from './profile-paths';

/** Every flat file / dir a pre-multi-profile install wrote directly under the root, moved as a unit
 *  into `Profiles/default/` (ADR-0045). Each move is individually existence-guarded, so a fresh
 *  install (none of these exist) and a partial retry are both no-ops / idempotent. */
const LEGACY_ENTRIES = [
  'tepegoz.db',
  // SQLite's WAL sidecars. Moving the .db without them silently drops everything written since the
  // last checkpoint (i.e. the tail of the user's last session, if it ended in a crash / kill).
  'tepegoz.db-wal',
  'tepegoz.db-shm',
  'preferences.json',
  'credentials.enc.json',
  'translate-memory.json',
  'adblock',
  'dictionaries',
  'safe-browsing',
  'models',
  'Extensions',
  join('Downloads', 'quarantine'),
  // VPN secrets (WireGuard configs, Tor state) and the downloaded wireproxy / obfs4 binaries — real
  // user config and a non-trivial re-download, respectively.
  'vpn',
  'bin',
  // Chromium's own per-partition storage. Under process-per-profile the root is no longer any
  // process's userData, so leaving these behind would silently drop the user's cookies / logins.
  'Partitions',
];

function moveIfExists(src: string, dst: string): void {
  if (!existsSync(src)) return;
  mkdirSync(dirname(dst), { recursive: true });
  try {
    renameSync(src, dst);
  } catch {
    // Cross-volume rename fails — fall back to copy + delete (still atomic-enough: worst case a crash
    // mid-copy leaves the source intact, so a retry on next launch just re-copies).
    try {
      cpSync(src, dst, { recursive: true });
      rmSync(src, { recursive: true, force: true });
    } catch (err) {
      Logger.warn('Failed to migrate a legacy profile file / dir', { src, dst, err: String(err) });
    }
  }
}

function defaultProfileName(): string {
  try {
    const name = userInfo().username;
    return name.length > 0 ? name : 'Person 1';
  } catch {
    return 'Person 1';
  }
}

/**
 * First-run, one-time move of a pre-multi-profile install's flat files (which sat directly in
 * `<root>`, back when the root WAS the single userData directory) into `<root>/Profiles/default/`,
 * then writes the registry. Runs from `profile-boot.ts` before `userData` is pinned, so it operates on
 * the shared ROOT rather than any one profile's directory. No-op once `profiles.json` exists (already
 * migrated, or already a fresh multi-profile-aware install).
 */
export function migrateLegacyProfile(root: string): void {
  const registryPath = profilesJsonPath(root);
  if (existsSync(registryPath)) return;

  const isMigration = ['tepegoz.db', 'preferences.json', 'credentials.enc.json'].some((f) =>
    existsSync(join(root, f)),
  );

  const defaultDir = profileDir(root, DEFAULT_PROFILE_ID);
  try {
    mkdirSync(defaultDir, { recursive: true });
    if (isMigration) {
      for (const entry of LEGACY_ENTRIES) {
        moveIfExists(join(root, entry), join(defaultDir, entry));
      }
    }
  } catch (err) {
    // Data loss-safe: on any failure, leave whatever moved where it landed and let the stores treat
    // Profiles/default/ as freshly-initialized (the same corrupt / missing-file tolerance they already
    // have).
    Logger.warn('Multi-profile migration into Profiles/default/ failed partway', {
      err: String(err),
    });
  }

  try {
    ProfilesStore.init({ filePath: registryPath });
    ProfilesStore.add({ name: defaultProfileName(), colorId: 0 });
  } catch (err) {
    Logger.warn('Failed to initialize profiles.json after migration', { err: String(err) });
  }
}
