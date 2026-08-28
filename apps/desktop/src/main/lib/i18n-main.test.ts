import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The single source of MAIN-PROCESS user-facing strings (native menus, internal-tab titles). Non-
 * React: it picks each owning package's dict for the active locale with `pick`, not `useT`. What's
 * worth pinning: the locale precedence (explicit pref wins, else the OS), that every namespace the
 * main process renders is present, and that the strings actually follow the locale.
 */

const prefs = vi.hoisted(() => ({ locale: 'en' }));
vi.mock('@tepegoz/preferences', () => ({ default: { getAll: () => ({ locale: prefs.locale }) } }));
vi.mock('electron', () => ({ app: { getLocale: () => 'de-DE' } }));

const { mainLocale, mainStrings } = await import('./i18n-main');

beforeEach(() => {
  prefs.locale = 'en';
});

describe('mainLocale', () => {
  it('returns an explicit en/tr preference as-is', () => {
    prefs.locale = 'tr';
    expect(mainLocale()).toBe('tr');
    prefs.locale = 'en';
    expect(mainLocale()).toBe('en');
  });

  it('falls back to resolving the OS locale when the pref is not en/tr', () => {
    prefs.locale = 'system';
    // `de-DE` is neither shipped locale → resolveLocale lands on the English default.
    expect(mainLocale()).toBe('en');
  });
});

describe('mainStrings', () => {
  it('exposes every namespace the main process renders', () => {
    const s = mainStrings();
    for (const key of [
      'agent',
      'bookmarks',
      'browser',
      'common',
      'downloads',
      'errors',
      'extensions',
      'history',
      'process',
      'tasks',
      'translate',
      'uploads',
    ]) {
      expect(s).toHaveProperty(key);
    }
    // `process` is the Task Manager surface's own dict, added 2026-08-28.
    expect(typeof s.process.title).toBe('string');
  });

  it('follows the active locale', () => {
    prefs.locale = 'en';
    const en = mainStrings().process.title;
    prefs.locale = 'tr';
    const tr = mainStrings().process.title;
    expect(en).not.toBe(tr);
  });
});
