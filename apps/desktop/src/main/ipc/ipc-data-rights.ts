import { shell } from 'electron';
import { AppError } from '@tepegoz/libs';
import { IpcChannels } from '@tepegoz/desktop-ipc';
import { DataRightsExportRequestSchema, type DataRightsExportResult } from '@tepegoz/shared-types';
import { AgentConversationStore, EventJournal, HistoryStore } from '@tepegoz/persistence';
import { BookmarkTreeStore } from '@tepegoz/bookmarks';
import {
  buildSubjectAccessReport,
  renderSubjectAccessMarkdown,
  searchEventsForSubject,
} from '../privacy/subject-access-search';
import { getDb } from '../db/database.electron';
import FileOperationsHost from '../file-operations/file-operations-host';
import { handleAsync } from './ipc-helpers';

/**
 * Register `privacy:data-rights-export` (Phase 7 Data Rights, first slice). Deliberately NOT gated
 * behind the Agent extension being enabled — a KVKK/GDPR subject-access request is about data already
 * collected, which does not stop being the user's to export just because they later turned the
 * extension off.
 */

// A subject-access export needs everything it can find, not a UI page's worth — same reasoning as the
// other search dimensions' own caps.
const MAX_HISTORY_MATCHES = 500;
const MAX_BOOKMARK_MATCHES = 500;

export function registerDataRightsIpc(): void {
  handleAsync(
    IpcChannels.dataRightsExport,
    async (_event, payload): Promise<DataRightsExportResult> => {
      const { subject } = DataRightsExportRequestSchema.parse(payload);
      const db = getDb();
      if (db === null) {
        throw new AppError('No database available to search.', 503);
      }
      const matchedTurns = AgentConversationStore.searchTurnsForSubject(db, subject);
      const matchedHistory = HistoryStore.search(db, subject, MAX_HISTORY_MATCHES, 0);
      const matchedBookmarks = BookmarkTreeStore.search(db, subject, MAX_BOOKMARK_MATCHES);
      // Unbounded — the Journal has no fold-column index to search by (see subject-access-search.ts's
      // module doc), so this reads every row this device has ever written. Fine at today's scale; a
      // known limit worth revisiting once a real install has years of history.
      const allEvents = EventJournal.readFrom(db, 0);
      const matchedEvents = searchEventsForSubject(allEvents, subject);

      const generatedAt = Date.now();
      const markdown = renderSubjectAccessMarkdown(
        buildSubjectAccessReport({
          subject,
          generatedAt,
          matchedEvents,
          matchedTurns,
          matchedHistory,
          matchedBookmarks,
        }),
      );
      const now = new Date(generatedAt);
      const pad = (n: number): string => String(n).padStart(2, '0');
      const stamp =
        `${String(now.getFullYear())}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}` +
        `_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
      const filename = `data_rights_export_${stamp}.md`;
      const filePath = await FileOperationsHost.writeExport(filename, markdown);
      shell.showItemInFolder(filePath);

      return {
        subject,
        matchedTurns: matchedTurns.length,
        matchedEvents: matchedEvents.length,
        matchedHistoryEntries: matchedHistory.length,
        matchedBookmarks: matchedBookmarks.length,
        filePath,
      };
    },
  );
}
