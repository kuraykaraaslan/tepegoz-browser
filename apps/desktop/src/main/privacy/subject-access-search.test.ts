import { describe, expect, it } from 'vitest';
import type { EventRecord } from '@tepegoz/shared-types';
import type { AgentConversationTurn } from '@tepegoz/ext-agent/history';
import type { HistoryEntry } from '@tepegoz/persistence';
import type { BookmarkEntry } from '@tepegoz/bookmarks';
import {
  buildSubjectAccessReport,
  renderSubjectAccessMarkdown,
  searchEventsForSubject,
} from './subject-access-search';

/**
 * Data Rights subject-access search. Pinned: event matching checks actor/correlationId/payload,
 * Turkish-folded the same way `AgentConversationStore` folds conversations (no separate rule to drift
 * from); an empty subject matches nothing (never "everything"); the cap keeps a pathological query from
 * returning the whole journal; and the rendered document says so, in plain language, when a search
 * dimension found nothing rather than a UI-less blank.
 */

function event(over: Partial<EventRecord> = {}): EventRecord {
  return {
    lsn: 1,
    id: '00000000-0000-4000-8000-000000000001',
    type: 'AgentStepExecuted',
    ts: 1000,
    actor: 'agent',
    correlationId: 'run-1',
    payload: { kind: 'step_ok', message: 'contacted kaya@example.com' },
    redacted: true,
    deviceId: 'device-1',
    ...over,
  };
}

function turn(over: Partial<AgentConversationTurn> = {}): AgentConversationTurn {
  return {
    id: 't1',
    conversationId: 'c1',
    prompt: 'Email kaya@example.com',
    status: 'completed',
    events: [],
    attachments: [],
    createdAt: 1000,
    updatedAt: 1000,
    ...over,
  };
}

function historyEntry(over: Partial<HistoryEntry> = {}): HistoryEntry {
  return {
    url: 'https://example.com/kaya',
    title: 'Kaya profile',
    ts: 1000,
    visitCount: 1,
    favicon: null,
    ...over,
  };
}

function bookmarkEntry(over: Partial<BookmarkEntry> = {}): BookmarkEntry {
  return {
    url: 'https://example.com/kaya',
    title: 'Kaya profile',
    favicon: null,
    ts: 1000,
    ...over,
  };
}

describe('searchEventsForSubject', () => {
  it('matches on the payload text', () => {
    const events = [event({ payload: { message: 'about kaya@example.com' } })];
    expect(searchEventsForSubject(events, 'kaya@example.com')).toHaveLength(1);
  });

  it('matches Turkish text the same folded way AgentConversationStore does', () => {
    const events = [event({ payload: { message: 'ŞİŞLİ için özet hazır' } })];
    expect(searchEventsForSubject(events, 'sisli')).toHaveLength(1);
  });

  it('matches on actor or correlationId too, not only the payload', () => {
    const events = [event({ actor: 'agent:kaya-worker', payload: { message: 'unrelated' } })];
    expect(searchEventsForSubject(events, 'kaya-worker')).toHaveLength(1);
  });

  it('returns nothing for an empty subject rather than treating it as "match everything"', () => {
    const events = [event(), event({ id: 'e2' })];
    expect(searchEventsForSubject(events, '')).toEqual([]);
    expect(searchEventsForSubject(events, '   ')).toEqual([]);
  });

  it('is empty for a subject nothing mentions', () => {
    expect(searchEventsForSubject([event()], 'nobody-mentioned-this')).toEqual([]);
  });

  it('caps at 500 matches rather than returning an unbounded scan of the whole journal', () => {
    const events = Array.from({ length: 600 }, (_, i) =>
      event({ id: `e${String(i)}`, lsn: i, payload: { message: 'kaya@example.com' } }),
    );
    expect(searchEventsForSubject(events, 'kaya@example.com')).toHaveLength(500);
  });
});

describe('buildSubjectAccessReport', () => {
  it('orders matched events by lsn regardless of input order', () => {
    const report = buildSubjectAccessReport({
      subject: 'kaya',
      generatedAt: 5000,
      matchedEvents: [event({ lsn: 2, id: 'e2' }), event({ lsn: 1, id: 'e1' })],
      matchedTurns: [],
      matchedHistory: [],
      matchedBookmarks: [],
    });
    expect(report.matchedEvents.map((e) => e.id)).toEqual(['e1', 'e2']);
  });
});

describe('renderSubjectAccessMarkdown', () => {
  it('includes the subject, matched conversation content, matched journal events, matched history, and matched bookmarks', () => {
    const report = buildSubjectAccessReport({
      subject: 'kaya@example.com',
      generatedAt: 5000,
      matchedEvents: [event()],
      matchedTurns: [turn({ responseSummary: 'Sent.' })],
      matchedHistory: [historyEntry({ title: 'Kaya — Example', url: 'https://example.com/kaya' })],
      matchedBookmarks: [bookmarkEntry({ title: 'Kaya (bookmarked)', url: 'https://example.com/b' })],
    });
    const md = renderSubjectAccessMarkdown(report);
    expect(md).toContain('kaya@example.com');
    expect(md).toContain('Email kaya@example.com');
    expect(md).toContain('Sent.');
    expect(md).toContain('AgentStepExecuted');
    expect(md).toContain('[Kaya — Example](https://example.com/kaya)');
    expect(md).toContain('[Kaya (bookmarked)](https://example.com/b)');
  });

  it('falls back to the bare URL when a history entry or a bookmark has no title', () => {
    const report = buildSubjectAccessReport({
      subject: 'kaya',
      generatedAt: 5000,
      matchedEvents: [],
      matchedTurns: [],
      matchedHistory: [historyEntry({ title: '', url: 'https://example.com/kaya' })],
      matchedBookmarks: [bookmarkEntry({ title: '', url: 'https://example.com/b' })],
    });
    const md = renderSubjectAccessMarkdown(report);
    expect(md).toContain('[https://example.com/kaya](https://example.com/kaya)');
    expect(md).toContain('[https://example.com/b](https://example.com/b)');
  });

  it('says plainly when a dimension found nothing, rather than an empty section', () => {
    const report = buildSubjectAccessReport({
      subject: 'nobody',
      generatedAt: 5000,
      matchedEvents: [],
      matchedTurns: [],
      matchedHistory: [],
      matchedBookmarks: [],
    });
    const md = renderSubjectAccessMarkdown(report);
    expect(md).toContain('No conversation turn mentions this subject');
    expect(md).toContain('No journal event mentions this subject');
    expect(md).toContain('No history entry mentions this subject');
    expect(md).toContain('No bookmark mentions this subject');
  });

  it('discloses the coverage gap up front — downloads/stored files are not searched yet', () => {
    const report = buildSubjectAccessReport({
      subject: 'x',
      generatedAt: 0,
      matchedEvents: [],
      matchedTurns: [],
      matchedHistory: [],
      matchedBookmarks: [],
    });
    const md = renderSubjectAccessMarkdown(report);
    expect(md).toContain('not yet covered');
  });
});
