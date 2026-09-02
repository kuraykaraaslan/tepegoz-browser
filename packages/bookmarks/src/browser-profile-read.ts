import {
  closeSync,
  copyFileSync,
  mkdtempSync,
  openSync,
  readFileSync,
  readSync,
  rmSync,
  statSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import { openDatabase } from '@tepegoz/persistence';
import { parseChromiumBookmarksJson } from './bookmark-import-chromium';
import {
  buildFirefoxBookmarkTree,
  FIREFOX_PLACES_QUERY,
  type FirefoxBookmarkRow,
} from './bookmark-import-firefox';
import type { ParsedBookmarks } from './bookmark-import-limits';
import type { DetectedBrowserProfile } from './browser-profiles';

/**
 * Reading a detected profile's bookmarks off disk. The only module here that touches another
 * application's files, kept apart from the tree logic so that logic stays testable without them.
 *
 * Node-only — reached through `@tepegoz/bookmarks/profiles`, never the package index.
 */

/** A `Bookmarks` file is JSON text. A large real profile is a few MB; this is well past that and still
 *  refuses a file that could not plausibly be one. */
const MAX_CHROMIUM_BYTES = 64 * 1024 * 1024;
/** `places.sqlite` carries all history too, so it is legitimately much bigger than the bookmarks in it. */
const MAX_PLACES_BYTES = 1024 * 1024 * 1024;

/**
 * Rows come out of a database this application did not write. Per-row `safeParse`, and a row that
 * fails is skipped rather than failing the import: one damaged entry must not cost the user the other
 * five thousand.
 */
const FirefoxRowSchema = z.object({
  id: z.number().int(),
  parent: z.number().int(),
  type: z.number().int(),
  title: z.string().max(4096).nullable().catch(null),
  position: z.number().int().catch(0),
  guid: z.string().max(64).nullable().catch(null),
  url: z.string().max(65_536).nullable().catch(null),
});

/** Read one detected profile. `null` means the file could not be read as bookmarks at all — the caller
 *  reports that to the user rather than showing an import that found nothing. */
export function readProfileBookmarks(profile: DetectedBrowserProfile): ParsedBookmarks | null {
  return profile.format === 'chromium-json'
    ? readChromiumBookmarks(profile.path)
    : readFirefoxBookmarks(profile.path);
}

function readChromiumBookmarks(path: string): ParsedBookmarks | null {
  try {
    if (statSync(path).size > MAX_CHROMIUM_BYTES) return null;
    return parseChromiumBookmarksJson(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * Firefox's database is opened through a COPY, never in place.
 *
 * Two reasons, both real. The file is usually locked while Firefox runs, so opening it directly fails
 * exactly when the user is most likely to be importing — right after switching browsers. And opening a
 * SQLite file writes to it (journal mode, the `-wal` and `-shm` sidecars); a browser that quietly wrote
 * into another browser's profile while "reading" it would deserve every complaint it got. The sidecars
 * are copied too, because in WAL mode the newest commits live in `-wal` and a copy without it is a
 * silently stale profile.
 */
function readFirefoxBookmarks(path: string): ParsedBookmarks | null {
  let scratch: string | null = null;
  try {
    if (statSync(path).size > MAX_PLACES_BYTES) return null;
    // Check the header BEFORE copying anything. Not an optimization: `openDatabase` throws part-way
    // through construction on a file that is not a database, which leaves the handle unreachable and
    // therefore unclosed — and on Windows an open handle makes the scratch copy undeletable, so the
    // cleanup then threw out of a function whose whole contract is to return null instead. Refusing
    // the file up front removes that path rather than papering over it.
    if (!isSqliteFile(path)) return null;
    scratch = mkdtempSync(join(tmpdir(), 'tepegoz-import-'));
    const copy = join(scratch, 'places.sqlite');
    copyFileSync(path, copy);
    for (const suffix of ['-wal', '-shm']) {
      try {
        copyFileSync(`${path}${suffix}`, `${copy}${suffix}`);
      } catch {
        // Absent sidecars are the normal case for a browser that exited cleanly.
      }
    }

    const db = openDatabase(copy);
    try {
      const rows: FirefoxBookmarkRow[] = [];
      for (const raw of db.prepare(FIREFOX_PLACES_QUERY).all()) {
        const checked = FirefoxRowSchema.safeParse(raw);
        if (checked.success) rows.push(checked.data);
      }
      return buildFirefoxBookmarkTree(rows);
    } finally {
      db.close();
    }
  } catch {
    return null;
  } finally {
    // Best effort, and deliberately silent: a scratch copy that cannot be removed right now is a
    // temp-directory entry the OS will reclaim. Throwing here would turn a successful import into an
    // exception at the IPC boundary, which is the one outcome that would actually cost the user
    // something.
    if (scratch !== null) {
      try {
        rmSync(scratch, { recursive: true, force: true });
      } catch {
        /* empty */
      }
    }
  }
}

/** Every SQLite file starts with these 15 bytes and a NUL. Compared as two halves so this source
 *  file does not have to carry a NUL byte of its own. */
const SQLITE_MAGIC = 'SQLite format 3';

function isSqliteFile(path: string): boolean {
  let fd: number | null = null;
  try {
    fd = openSync(path, 'r');
    const header = Buffer.alloc(16);
    if (readSync(fd, header, 0, 16, 0) !== 16) return false;
    return header.subarray(0, 15).toString('latin1') === SQLITE_MAGIC && header[15] === 0;
  } catch {
    return false;
  } finally {
    if (fd !== null) closeSync(fd);
  }
}
