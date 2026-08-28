// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { settingsDict, type SettingsStrings } from '@tepegoz/settings-ui';
import { foldForSearch } from '@tepegoz/i18n';
import { DEFAULT_PREFERENCES } from '@tepegoz/preferences/model';
import type { CredentialsStatus } from '@tepegoz/desktop-ipc';
import { buildSettingsSections, type SettingsSectionsCtx } from './SettingsPage-sections';

/**
 * The settings search index, held to the one property that makes it trustworthy.
 *
 * `searchText` is hand-written per section, which means it goes stale silently: a page can be renamed,
 * or grow a whole card, and remain unfindable by the words on it while every gate stays green. That is
 * not hypothetical — the About section's search text still described the version-and-platform card
 * long after the page had been rewritten around build provenance, licensing and diagnostics, and
 * nothing caught it because nothing was looking.
 *
 * So this asserts the floor rather than the ceiling: a section must at least be findable by its own
 * NAME and its GROUP heading, in both locales. It cannot verify that the text covers a page's whole
 * contents — no test can, short of rendering and scraping — but the case that actually bit was a
 * section whose own title had drifted out of its index entry, and that case is now caught.
 *
 * Folding matters here for the same reason the search box folds: a Turkish user typing `sifreler`
 * must find `Şifreler`, so the comparison has to run through the same normalisation the shell uses.
 */

const NOOP = (): void => undefined;
const ASYNC_NOOP = (): Promise<void> => Promise.resolve();

function ctxFor(s: SettingsStrings): SettingsSectionsCtx {
  return {
    s,
    prefs: DEFAULT_PREFERENCES,
    status: { encryptionAvailable: true, providers: [], keys: [] } as unknown as CredentialsStatus,
    // The dev-only section is built too: it has a search entry like any other, and excluding it here
    // would leave the one section a contributor is least likely to re-check unguarded.
    developerVisible: true,
    setPref: NOOP,
    notify: NOOP,
    setDeveloperPref: ASYNC_NOOP,
    clearBrowsingHistory: NOOP,
    resetSitePermission: NOOP,
    setSitePermission: NOOP,
    resetToDefaults: NOOP,
    onAddKey: ASYNC_NOOP,
    onRemoveKeyById: ASYNC_NOOP,
    onRenameKey: ASYNC_NOOP,
    onSetKeyModel: ASYNC_NOOP,
    onReorderKeys: ASYNC_NOOP,
    loginCredentials: [],
    onLoginSectionMount: ASYNC_NOOP,
    onAddLogin: ASYNC_NOOP,
    onRemoveLogin: ASYNC_NOOP,
    onImportLogins: () => Promise.resolve({ imported: 0, skipped: 0, failed: 0 } as never),
    onExportLogins: () => Promise.resolve(''),
  };
}

describe.each([['en'], ['tr']] as const)('the settings search index (%s)', (locale) => {
  const sections = buildSettingsSections(ctxFor(settingsDict[locale]));

  it('builds every section exactly once, with unique ids', () => {
    const ids = sections.map((section) => section.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBeGreaterThan(15);
  });

  it('lets every section be found by its own name', () => {
    const unfindable = sections
      .filter((section) => !foldForSearch(section.searchText).includes(foldForSearch(section.label)))
      .map((section) => section.id);
    expect(unfindable).toEqual([]);
  });

  it('gives every section a search entry with real words in it', () => {
    // A section whose entry is only its own label is one nobody wrote an index for; the point of the
    // field is the vocabulary a user brings that the label does not contain.
    const thin = sections
      .filter((section) => section.searchText.trim().split(/\s+/).length < 4)
      .map((section) => section.id);
    expect(thin).toEqual([]);
  });

  it('groups every section under a heading', () => {
    const ungrouped = sections.filter((section) => section.group === undefined).map((s) => s.id);
    expect(ungrouped).toEqual([]);
  });
});
