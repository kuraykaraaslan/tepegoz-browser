import { describe, expect, it } from 'vitest';
import { SHORTCUTS } from '@tepegoz/shortcuts';
import { en } from './i18n/en';
import { tr } from './i18n/tr';

/**
 * Every shortcut in the registry has a description, in both locales.
 *
 * The registry is the only place a global key may be bound, so this is what keeps the help list
 * complete: adding a shortcut without describing it fails here rather than showing the user its
 * internal id. Same shape as the policy-reason and error-code parity tests, for the same reason — the
 * words get written by whoever adds the thing.
 */
describe('the keyboard-shortcut help list is complete', () => {
  const enText: Record<string, string> = en.shortcuts;
  const trText: Record<string, string> = tr.shortcuts;

  it('describes every registered shortcut in English', () => {
    expect(SHORTCUTS.filter((s) => !(s.id in enText)).map((s) => s.id)).toEqual([]);
  });

  it('describes every one of them in Turkish', () => {
    expect(SHORTCUTS.filter((s) => !(s.id in trText)).map((s) => s.id)).toEqual([]);
  });

  it('is translated rather than copied', () => {
    const copied = SHORTCUTS.filter((s) => enText[s.id] === trText[s.id]).map((s) => s.id);
    expect(copied).toEqual([]);
  });

  it('carries no description for a shortcut that no longer exists', () => {
    // A stale row is text nobody will ever see, which reads as coverage.
    const ids = new Set<string>(SHORTCUTS.map((s) => s.id));
    const stale = Object.keys(enText).filter(
      (k) => !ids.has(k) && k !== 'title' && k !== 'subtitle',
    );
    expect(stale).toEqual([]);
  });
});
