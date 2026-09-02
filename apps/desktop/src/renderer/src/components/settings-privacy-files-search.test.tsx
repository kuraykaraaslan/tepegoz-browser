// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { I18nProvider } from '@tepegoz/i18n/react';
import { settingsDict } from '@tepegoz/settings-ui';
import { DEFAULT_PREFERENCES } from '@tepegoz/preferences';
import { DEFAULT_SEARCH_ENGINE_ID } from '@tepegoz/shared-types/search-engines';
import type { Preferences } from '@tepegoz/desktop-ipc';
import { SearchStartupSection } from './settings-privacy-files-search';

/**
 * Homepage + search engines. The load-bearing checks: a custom "search engine" that is really a
 * script (`javascript:...{q}`) is refused by the same predicate the schema uses, so the omnibox can
 * never be handed one; a duplicate engine name is refused (the picker stores an unseen id, two "Wiki"
 * rows are indistinguishable); and removing the selected custom engine falls the default back to the
 * built-in rather than silently leaving a dangling id.
 */

const s = settingsDict.en;

function renderSection(over: Partial<Preferences> = {}) {
  const setPref = vi.fn();
  render(
    <I18nProvider locale="en">
      <SearchStartupSection prefs={{ ...DEFAULT_PREFERENCES, ...over }} setPref={setPref} />
    </I18nProvider>,
  );
  return { setPref };
}

const addForm = () => screen.getByText(s.searchEngineCustom).parentElement as HTMLElement;
const addNameInput = () => within(addForm()).getByLabelText(s.searchEngineCustomName);
const addUrlInput = () => within(addForm()).getByLabelText(s.searchEngineCustomUrl);
const addBtn = () =>
  within(addForm()).getByRole<HTMLButtonElement>('button', { name: s.searchEngineCustomAdd });

const lastPatch = (setPref: ReturnType<typeof vi.fn>) =>
  setPref.mock.calls.at(-1)![0] as Partial<Preferences>;

afterEach(cleanup);

describe('SearchStartupSection', () => {
  it('refuses a javascript: template and explains why', () => {
    renderSection();
    fireEvent.change(addNameInput(), { target: { value: 'Evil' } });
    fireEvent.change(addUrlInput(), { target: { value: 'javascript:alert(1)?q={q}' } });
    expect(addBtn().disabled).toBe(true);
    expect(within(addForm()).getByText(s.searchEngineCustomInvalid)).toBeTruthy();
  });

  it('refuses a name that collides with an existing engine, case-insensitively', () => {
    renderSection();
    fireEvent.change(addNameInput(), { target: { value: 'gOOgle' } });
    fireEvent.change(addUrlInput(), { target: { value: 'https://x.example/?q={q}' } });
    expect(addBtn().disabled).toBe(true);
    expect(within(addForm()).getByText(s.searchEngineDuplicate)).toBeTruthy();
  });

  it('adds a valid custom engine', () => {
    const { setPref } = renderSection();
    fireEvent.change(addNameInput(), { target: { value: 'MySearch' } });
    fireEvent.change(addUrlInput(), { target: { value: 'https://s.example/?q={q}' } });
    fireEvent.click(addBtn());

    const added = lastPatch(setPref).customSearchEngines!;
    expect(added).toHaveLength(1);
    expect(added[0]).toMatchObject({
      name: 'MySearch',
      searchUrlTemplate: 'https://s.example/?q={q}',
    });
  });

  it('changes the default search engine', () => {
    const { setPref } = renderSection();
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'duckduckgo' } });
    expect(setPref).toHaveBeenCalledWith({ searchEngineId: 'duckduckgo' });
  });

  it('falls the default back to the built-in when the selected custom engine is removed', () => {
    const custom = { id: 'custom-1', name: 'Mine', searchUrlTemplate: 'https://m.example/?q={q}' };
    const { setPref } = renderSection({
      customSearchEngines: [custom],
      searchEngineId: 'custom-1',
    });
    fireEvent.click(screen.getByRole('button', { name: s.searchEngineRemove }));
    expect(lastPatch(setPref)).toEqual({
      customSearchEngines: [],
      searchEngineId: DEFAULT_SEARCH_ENGINE_ID,
    });
  });

  it('keeps the default when a non-selected custom engine is removed', () => {
    const custom = { id: 'custom-1', name: 'Mine', searchUrlTemplate: 'https://m.example/?q={q}' };
    const { setPref } = renderSection({ customSearchEngines: [custom], searchEngineId: 'google' });
    fireEvent.click(screen.getByRole('button', { name: s.searchEngineRemove }));
    expect(lastPatch(setPref)).toEqual({ customSearchEngines: [] });
  });
});
