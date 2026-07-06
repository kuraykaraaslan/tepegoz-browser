import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CapabilityRegistry } from '@tepegoz/capability-plane';
import { registerJournalTools } from './journal-tools';
import type { JournalReader } from './host';

function fakeHost(overrides?: Partial<JournalReader>): JournalReader {
  return {
    recentEvents: () => [],
    ...overrides,
  };
}

describe('registerJournalTools', () => {
  beforeEach(() => CapabilityRegistry.reset());

  it('registers journal_search_events as an always-on builtin', () => {
    registerJournalTools({ host: fakeHost() });
    const ids = CapabilityRegistry.list().map((d) => d.id);
    expect(ids).toEqual(['journal_search_events']);
    const d = CapabilityRegistry.get('journal_search_events')!.descriptor;
    expect(d.source).toBe('builtin');
    expect(d.category).toBe('journal');
  });

  it('defaults the limit to 20 and passes the injected host through', () => {
    const recentEvents = vi.fn(() => []);
    registerJournalTools({ host: fakeHost({ recentEvents }) });
    CapabilityRegistry.get('journal_search_events')!.handler({});
    expect(recentEvents).toHaveBeenCalledWith(20, undefined);
  });
});
