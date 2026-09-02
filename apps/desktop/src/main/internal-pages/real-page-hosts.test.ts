import { describe, expect, it } from 'vitest';
import { REAL_PAGE_HOSTS } from './real-page-hosts';

/**
 * `REAL_PAGE_HOSTS` is consumed by BOTH `protocol.ts` (which `tepegoz://` hosts get a real page served)
 * and `lib/trusted-origin.ts` (which `tepegoz://` senders may call privileged IPC). A stray entry
 * therefore both serves a page that should not exist AND hands it IPC trust, so the exact membership
 * is worth pinning as a decision rather than a detail.
 */

const EXPECTED = [
  'settings',
  'extensions',
  'history',
  'downloads',
  'uploads',
  'bookmarks',
  'process',
  'developer',
];

describe('REAL_PAGE_HOSTS', () => {
  it('is exactly the eight internal pages that are real WebContentsViews', () => {
    expect([...REAL_PAGE_HOSTS].sort()).toEqual([...EXPECTED].sort());
  });

  it('does not include tasks (no UI renders tepegoz://tasks) or newtab', () => {
    expect(REAL_PAGE_HOSTS.has('tasks')).toBe(false);
    expect(REAL_PAGE_HOSTS.has('newtab')).toBe(false);
  });

  it('is a Set, so membership checks in both consumers are O(1)', () => {
    expect(REAL_PAGE_HOSTS).toBeInstanceOf(Set);
  });
});
