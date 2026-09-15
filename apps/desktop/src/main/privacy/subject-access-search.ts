import { foldForSearch } from '@tepegoz/i18n';
import type { EventRecord } from '@tepegoz/shared-types';
import type { AgentConversationTurn } from '@tepegoz/ext-agent/history';
import type { HistoryEntry } from '@tepegoz/persistence';

/**
 * Data Rights — subject-access search (Phase 7, KVKK/GDPR self-service, first slice). Treats the local
 * Event Journal + Agent Conversation store + browsing History as a queryable personal-data corpus:
 * given a subject string (an email, a name, a domain — whatever the requester was called in what was
 * said TO or BY the agent, or visible in a URL/page title), find every place it appears and render a
 * portable, human-readable disclosure document.
 *
 * Deliberately narrower than the phase's own aspiration ("events, FTS5 memory, CAS blobs"): this is
 * agent-conversation turns (raw, unredacted — a subject-access response has to show the real data),
 * Event Journal payloads (already redacted at append time, so a secret never leaves via this path
 * either), and browsing History (`HistoryStore.search`, the SAME folded-LIKE query the History page
 * itself uses — no separate search rule for this module to drift from). Bookmarks, downloads, and the
 * blob store are not yet in scope — a real gap, recorded as such rather than implied to be covered.
 *
 * The Event Journal has no fold-column index (unlike conversations and history, which both reuse their
 * own store's existing folded-LIKE contract), so matching runs in JS over whatever the caller hands in —
 * the caller decides how much history that is.
 */

const MAX_EVENT_MATCHES = 500;

/** Every event whose actor, correlationId, or payload (stringified) mentions `subject`, Turkish-fold
 *  matched the same way `AgentConversationStore` does. Capped, oldest-first within the input order. */
export function searchEventsForSubject(
  events: readonly EventRecord[],
  subject: string,
): EventRecord[] {
  const needle = foldForSearch(subject);
  if (needle.length === 0) return [];
  const matches: EventRecord[] = [];
  for (const e of events) {
    let payloadText: string;
    try {
      payloadText = JSON.stringify(e.payload) ?? '';
    } catch {
      payloadText = String(e.payload);
    }
    const haystack = foldForSearch(`${e.actor} ${e.correlationId} ${payloadText}`);
    if (haystack.includes(needle)) {
      matches.push(e);
      if (matches.length >= MAX_EVENT_MATCHES) break;
    }
  }
  return matches;
}

export interface SubjectAccessReport {
  subject: string;
  generatedAt: number;
  matchedEvents: EventRecord[];
  matchedTurns: readonly AgentConversationTurn[];
  matchedHistory: readonly HistoryEntry[];
}

/** Structure a subject-access search's already-matched slices (from `searchEventsForSubject`,
 *  `AgentConversationStore.searchTurnsForSubject`, and `HistoryStore.search`) into one report. Pure —
 *  no I/O, no further filtering; the caller already did every search. */
export function buildSubjectAccessReport(input: {
  subject: string;
  generatedAt: number;
  matchedEvents: readonly EventRecord[];
  matchedTurns: readonly AgentConversationTurn[];
  matchedHistory: readonly HistoryEntry[];
}): SubjectAccessReport {
  return {
    subject: input.subject,
    generatedAt: input.generatedAt,
    matchedEvents: [...input.matchedEvents].sort((a, b) => a.lsn - b.lsn),
    matchedTurns: input.matchedTurns,
    matchedHistory: input.matchedHistory,
  };
}

function isoOrUnknown(ts: number): string {
  return new Date(ts).toISOString();
}

/** Render the report as a single self-contained Markdown document — the "portable SAR export" the
 *  phase names. Not a proof, not signed: a plain disclosure of what local search found. */
export function renderSubjectAccessMarkdown(report: SubjectAccessReport): string {
  const lines: string[] = [];
  lines.push(`# Subject Access Report — "${report.subject}"`);
  lines.push('');
  lines.push(
    `> Generated ${isoOrUnknown(report.generatedAt)}. A local search of the Agent Conversation ` +
      'history, the Event Journal, and browsing History for anything mentioning this subject. ' +
      'Bookmarks, downloads, and stored files are **not yet covered** by this search.',
  );
  lines.push('');
  lines.push(`## Browsing history (${String(report.matchedHistory.length)})`);
  lines.push('');
  if (report.matchedHistory.length === 0) {
    lines.push('_No history entry mentions this subject._');
  } else {
    for (const h of report.matchedHistory) {
      lines.push(`- [${isoOrUnknown(h.ts)}] [${h.title.length > 0 ? h.title : h.url}](${h.url})`);
    }
    lines.push('');
  }
  lines.push(`## Agent conversations (${String(report.matchedTurns.length)})`);
  lines.push('');
  if (report.matchedTurns.length === 0) {
    lines.push('_No conversation turn mentions this subject._');
  } else {
    for (const t of report.matchedTurns) {
      lines.push(`### ${isoOrUnknown(t.createdAt)} — conversation \`${t.conversationId}\``);
      lines.push('');
      lines.push(`**Prompt:** ${t.prompt}`);
      if (t.responseSummary !== undefined) {
        lines.push('');
        lines.push(`**Response:** ${t.responseSummary}`);
      }
      lines.push('');
    }
  }
  lines.push(`## Journal events (${String(report.matchedEvents.length)})`);
  lines.push('');
  if (report.matchedEvents.length === 0) {
    lines.push('_No journal event mentions this subject._');
  } else {
    for (const e of report.matchedEvents) {
      let payloadText: string;
      try {
        payloadText = JSON.stringify(e.payload);
      } catch {
        payloadText = String(e.payload);
      }
      lines.push(`- [${isoOrUnknown(e.ts)}] **${e.type}** (run \`${e.correlationId}\`): ${payloadText}`);
    }
  }
  lines.push('');
  return lines.join('\n');
}
