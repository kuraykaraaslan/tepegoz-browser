import { describe, expect, it } from 'vitest';
import type { CompletionEvidence } from '@tepegoz/shared-types';
import { en } from './i18n/en';
import { describeEvidence, evidenceChipTitle } from './panel-evidence';

describe('describeEvidence', () => {
  it('renders one line per item, kind + verdict + detail', () => {
    const evidence: CompletionEvidence = {
      mutating: true,
      items: [
        { id: 'a', kind: 'network', verdict: 'contradicts', detail: '5xx after the Save click' },
        { id: 'b', kind: 'page_validation', verdict: 'supports', detail: 'toast read "Saved"' },
      ],
    };
    const text = describeEvidence(evidence, en);
    expect(text).toBe(
      'Network: contradicts — 5xx after the Save click\n' +
        'Page check: supports — toast read "Saved"',
    );
  });

  it('returns an empty string for an empty evidence bundle (a pure read task)', () => {
    expect(describeEvidence({ mutating: false, items: [] }, en)).toBe('');
  });

  it('covers every EvidenceItem kind with a real label, not the raw snake_case code', () => {
    const evidence: CompletionEvidence = {
      mutating: true,
      items: [
        { id: 'a', kind: 'network', verdict: 'supports', detail: 'd' },
        { id: 'b', kind: 'page_validation', verdict: 'contradicts', detail: 'd' },
        { id: 'c', kind: 'url_match', verdict: 'inconclusive', detail: 'd' },
      ],
    };
    const text = describeEvidence(evidence, en);
    // `network`'s English label happens to be capitalized-but-otherwise-identical, so only the
    // snake_case codes (which never read as prose) are asserted absent here.
    expect(text).not.toContain('page_validation');
    expect(text).not.toContain('url_match');
  });
});

describe('evidenceChipTitle', () => {
  it('appends the citations to the hint when there are any', () => {
    const evidence: CompletionEvidence = {
      mutating: true,
      items: [{ id: 'a', kind: 'url_match', verdict: 'supports', detail: 'landed on /confirm' }],
    };
    expect(evidenceChipTitle('The agent confirmed this.', evidence, en)).toBe(
      'The agent confirmed this.\n\nURL match: supports — landed on /confirm',
    );
  });

  it('falls back to the plain hint when evidence is absent', () => {
    expect(evidenceChipTitle('The agent confirmed this.', undefined, en)).toBe(
      'The agent confirmed this.',
    );
  });

  it('falls back to the plain hint when evidence has no items', () => {
    expect(evidenceChipTitle('The agent confirmed this.', { mutating: false, items: [] }, en)).toBe(
      'The agent confirmed this.',
    );
  });
});
