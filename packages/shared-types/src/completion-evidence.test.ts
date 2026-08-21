import { describe, expect, it } from 'vitest';
import {
  CompletionEvidenceSchema,
  classifyCompletion,
  type CompletionEvidence,
} from './completion-evidence';

const item = (
  verdict: 'supports' | 'contradicts' | 'inconclusive',
  id = 'n1',
): CompletionEvidence['items'][number] => ({
  id,
  kind: 'network',
  verdict,
  detail: 'POST /save',
});

describe('classifyCompletion', () => {
  it('verifies a mutating claim backed by a supporting record', () => {
    expect(classifyCompletion({ mutating: true, items: [item('supports')] })).toBe('verified');
  });

  it('CONTRADICTS on a failed request, however many green signals sit beside it', () => {
    // A page cannot un-fail a request by saying it succeeded — one contradiction outranks the rest.
    expect(
      classifyCompletion({
        mutating: true,
        items: [item('supports', 'a'), item('supports', 'b'), item('contradicts', 'c')],
      }),
    ).toBe('contradicted');
  });

  it('downgrades a mutating claim with NO supporting record to attempted_unverified', () => {
    expect(classifyCompletion({ mutating: true, items: [] })).toBe('attempted_unverified');
    expect(classifyCompletion({ mutating: true, items: [item('inconclusive')] })).toBe(
      'attempted_unverified',
    );
  });

  it('does not punish a pure read for having nothing to verify', () => {
    expect(classifyCompletion({ mutating: false, items: [] })).toBe('verified');
  });

  it('still contradicts a read task when a record actively disagrees', () => {
    expect(classifyCompletion({ mutating: false, items: [item('contradicts')] })).toBe(
      'contradicted',
    );
  });
});

describe('CompletionEvidenceSchema', () => {
  it('rejects an unknown verdict rather than coercing it to something safe-looking', () => {
    const bad = {
      mutating: true,
      items: [{ id: 'x', kind: 'network', verdict: 'probably', detail: '' }],
    };
    expect(CompletionEvidenceSchema.safeParse(bad).success).toBe(false);
  });

  it('bounds the bundle so a hostile page cannot flood the settle step', () => {
    const many = Array.from({ length: 60 }, (_, i) => item('supports', `n${String(i)}`));
    expect(CompletionEvidenceSchema.safeParse({ mutating: true, items: many }).success).toBe(false);
  });
});
