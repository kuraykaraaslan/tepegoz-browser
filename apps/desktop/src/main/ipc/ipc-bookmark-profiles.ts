import { IpcChannels, type BookmarkImportResult } from '@tepegoz/desktop-ipc';
import type { DetectedBrowserProfile } from '@tepegoz/desktop-ipc';
import { BookmarkImportProfileSchema } from '@tepegoz/desktop-ipc/schemas';
import { writeParsedBookmarksToStore } from '@tepegoz/bookmarks';
import { detectBrowserProfiles, readProfileBookmarks } from '@tepegoz/bookmarks/profiles';
import { getDb } from '../db/database.electron';
import { handle } from './ipc-helpers';

/**
 * Importing bookmarks from a browser profile that is already on this computer (ADR-0010 250-line cap:
 * its own module rather than more weight in `ipc-content-browsing.ts`).
 *
 * The security shape of this pair is the point. Detection runs entirely in main and returns records
 * WITHOUT the file path; the renderer picks one by opaque id, and the import handler resolves that id
 * by running detection again and matching. So the untrusted side never names a file for the trusted
 * side to open — the set of readable files is fixed by the detector, not by the payload — and no
 * absolute path (which carries the user's account name) is ever handed to the chrome.
 */
export function registerBookmarkProfileIpc(
  broadcastBookmarksChanged: () => void,
): void {
  handle(IpcChannels.bookmarksDetectProfiles, (): DetectedBrowserProfile[] =>
    detectBrowserProfiles().map(({ id, source, browserLabel, profileName, modifiedAt }) => ({
      id,
      source,
      browserLabel,
      profileName,
      modifiedAt,
    })),
  );

  handle(IpcChannels.bookmarksImportProfile, (_event, payload): BookmarkImportResult => {
    const id = BookmarkImportProfileSchema.parse(payload);
    const empty = { imported: 0, skipped: 0, folders: 0, truncated: false };
    const db = getDb();
    if (db === null) return { ...empty, errors: ['Database is unavailable'] };

    const profile = detectBrowserProfiles().find((candidate) => candidate.id === id);
    // Not an error worth a stack trace: the browser can be uninstalled, or the profile deleted,
    // between the list being shown and the button being pressed.
    if (profile === undefined) return { ...empty, errors: ['That profile is no longer available.'] };

    const result = writeParsedBookmarksToStore(
      db,
      readProfileBookmarks(profile),
      `Imported from ${profile.browserLabel} — ${profile.profileName}`,
    );
    if (result.imported > 0 || result.folders > 0) broadcastBookmarksChanged();
    return result;
  });
}
