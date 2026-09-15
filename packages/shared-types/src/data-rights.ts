import { z } from 'zod';

/**
 * Data Rights — subject-access export (Phase 7, KVKK/GDPR self-service). `subject` is whatever the
 * requester was called in what was said to or by the agent (an email, a name, a domain) — free text,
 * not a structured identifier, because the corpus being searched (conversation turns, journal payloads)
 * is free text too.
 */
export const DataRightsExportRequestSchema = z.object({
  subject: z.string().min(1).max(200),
});
export type DataRightsExportRequest = z.infer<typeof DataRightsExportRequestSchema>;

/** What the export actually found — counts, not a boolean, same reasoning as
 *  `BrowsingDataClearResult`: a report that could say "0 matches" must not be indistinguishable from
 *  one that never ran. */
export interface DataRightsExportResult {
  subject: string;
  matchedTurns: number;
  matchedEvents: number;
  /** Absolute path to the written Markdown SAR document. */
  filePath: string;
}
