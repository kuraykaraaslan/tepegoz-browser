import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  critiqueIntent,
  hasIntentCritic,
  setIntentCritic,
  shouldCritique,
  summarizeArgs,
} from './intent-critic';
import type { CriticRequest } from '@tepegoz/shared-types';

const req: CriticRequest = {
  goal: 'summarise the article',
  toolName: 'browser_update_page',
  tier: 'ui-write',
  argSummary: 'ref: number',
};

afterEach(() => {
  setIntentCritic(null);
});

describe('which calls the critic sees', () => {
  it('never looks at a read — that is what bounds its cost', () => {
    expect(shouldCritique('read')).toBe(false);
  });

  it('looks at every mutating tier', () => {
    for (const tier of [
      'ui-write',
      'data-egress',
      'financial',
      'credential',
      'destructive',
    ] as const) {
      expect(shouldCritique(tier)).toBe(true);
    }
  });

  it('does not run at all when no critic is installed', async () => {
    expect(hasIntentCritic()).toBe(false);
    expect(await critiqueIntent(req, 'financial')).toBeNull();
  });

  it('is not asked about a read even when installed', async () => {
    const critic = vi.fn(() => Promise.resolve({ aligned: true, reason: 'fine' }));
    setIntentCritic(critic);
    expect(await critiqueIntent(req, 'read')).toBeNull();
    expect(critic).not.toHaveBeenCalled();
  });
});

describe('what the critic is allowed to see', () => {
  it('describes arguments by KEY and SHAPE, never by value', () => {
    // The credential the broker keeps out of model context must not re-enter through the critic.
    const summary = summarizeArgs({ ref: 3, text: 'hunter2-the-actual-password', tabId: 't1' });
    expect(summary).not.toContain('hunter2');
    expect(summary).toContain('text: string(27)');
    expect(summary).toContain('ref: number');
  });

  it('summarises a nested object by its keys only', () => {
    expect(summarizeArgs({ card: { number: '4111111111111111', cvv: '123' } })).toBe(
      'card: {number,cvv}',
    );
  });

  it('reports an array by length', () => {
    expect(summarizeArgs({ paths: ['/a', '/b'] })).toBe('paths: array(2)');
  });

  it('handles a non-object argument without throwing', () => {
    expect(summarizeArgs('plain')).toBe('string');
    expect(summarizeArgs(null)).toBe('object');
  });
});

describe('the verdict is advisory and fail-quiet', () => {
  it('returns the verdict when the critic answers in shape', async () => {
    setIntentCritic(() =>
      Promise.resolve({ aligned: false, reason: 'emails a file the user never mentioned' }),
    );
    const verdict = await critiqueIntent(req, 'data-egress');
    expect(verdict).toEqual({ aligned: false, reason: 'emails a file the user never mentioned' });
  });

  it('returns null on a malformed verdict rather than inventing one', async () => {
    setIntentCritic(() => Promise.resolve({ verdict: 'looks fine to me' }));
    expect(await critiqueIntent(req, 'destructive')).toBeNull();
  });

  it('returns null when the critic throws — an advisory plane cannot fail an action', async () => {
    setIntentCritic(() => Promise.reject(new Error('classify tier unavailable')));
    expect(await critiqueIntent(req, 'financial')).toBeNull();
  });

  it('caps the reason, because the model wrote it and it lands in the journal', async () => {
    setIntentCritic(() => Promise.resolve({ aligned: false, reason: 'x'.repeat(400) }));
    expect(await critiqueIntent(req, 'ui-write')).toBeNull();
  });
});
