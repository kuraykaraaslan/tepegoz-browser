// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { I18nProvider } from '@tepegoz/i18n/react';
import { settingsDict } from '@tepegoz/settings-ui';
import { DEFAULT_PREFERENCES } from '@tepegoz/preferences';
import type { Preferences } from '@tepegoz/desktop-ipc';
import { DeveloperSection } from './settings-developer';

/**
 * The raw-preferences editor. `ChromiumFlagsCard` has its own test; what is pinned here is the
 * `PreferenceEditModal` reached from a table row: it edits a boolean/string/json value through the
 * right patch builder, refuses invalid JSON, resets a row to its default, and surfaces a rejected
 * write instead of closing as though it succeeded.
 */

const s = settingsDict.en;

function renderSection(over: Partial<Preferences> = {}, onUpdate?: () => Promise<void>) {
  const onUpdatePrefs = vi.fn<(patch: Partial<Preferences>) => Promise<void>>(
    onUpdate ?? (() => Promise.resolve()),
  );
  render(
    <I18nProvider locale="en">
      <DeveloperSection prefs={{ ...DEFAULT_PREFERENCES, ...over }} onUpdatePrefs={onUpdatePrefs} />
    </I18nProvider>,
  );
  return { onUpdatePrefs };
}

/** Narrow the table to one key and open its edit modal. */
function openEditor(key: string): HTMLElement {
  fireEvent.change(screen.getByPlaceholderText(s.developerSearchPlaceholder), {
    target: { value: key },
  });
  const editButtons = screen.getAllByRole('button', { name: s.developerEdit });
  fireEvent.click(editButtons[0]!);
  return screen.getByRole('dialog');
}

afterEach(cleanup);

describe('DeveloperSection — PreferenceEditModal', () => {
  it('flips a boolean preference through the boolean patch builder and closes', async () => {
    const { onUpdatePrefs } = renderSection({ onboardingCompleted: false });
    const dialog = openEditor('onboardingCompleted');
    fireEvent.click(within(dialog).getByRole('switch'));
    await waitFor(() =>
      expect(onUpdatePrefs).toHaveBeenCalledWith({ onboardingCompleted: true }),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('applies an edited string preference', async () => {
    const { onUpdatePrefs } = renderSection({ searchEngineId: 'google' });
    const dialog = openEditor('searchEngineId');
    fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: 'duckduckgo' } });
    fireEvent.click(within(dialog).getByRole('button', { name: s.developerApply }));
    await waitFor(() =>
      expect(onUpdatePrefs).toHaveBeenCalledWith({ searchEngineId: 'duckduckgo' }),
    );
  });

  it('refuses to apply invalid JSON, keeping the modal open with an error', () => {
    renderSection({ mcpServers: [] });
    const dialog = openEditor('mcpServers');
    fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: '[not json' } });
    fireEvent.click(within(dialog).getByRole('button', { name: s.developerApply }));
    expect(within(dialog).getByText(s.developerInvalidJson)).toBeTruthy();
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('applies a valid JSON edit', async () => {
    const { onUpdatePrefs } = renderSection({ mcpServers: [] });
    const dialog = openEditor('mcpServers');
    fireEvent.change(within(dialog).getByRole('textbox'), {
      target: { value: '[{"id":"x","label":"X","transport":"stdio","enabled":true}]' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: s.developerApply }));
    await waitFor(() => expect(onUpdatePrefs).toHaveBeenCalledTimes(1));
    expect((onUpdatePrefs.mock.calls[0]![0] as { mcpServers: unknown[] }).mcpServers).toHaveLength(1);
  });

  it('resets a diverged row to its default value', async () => {
    const { onUpdatePrefs } = renderSection({ searchEngineId: 'duckduckgo' });
    const dialog = openEditor('searchEngineId');
    fireEvent.click(within(dialog).getByRole('button', { name: s.developerResetRow }));
    await waitFor(() => expect(onUpdatePrefs).toHaveBeenCalledTimes(1));
    expect(Object.keys(onUpdatePrefs.mock.calls[0]![0])).toEqual(['searchEngineId']);
  });

  it('shows the write error instead of closing when the update rejects', async () => {
    const { onUpdatePrefs } = renderSection(
      { searchEngineId: 'google' },
      () => Promise.reject(new Error('disk is read-only')),
    );
    const dialog = openEditor('searchEngineId');
    fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: 'bing' } });
    fireEvent.click(within(dialog).getByRole('button', { name: s.developerApply }));
    await waitFor(() => expect(within(dialog).getByText('disk is read-only')).toBeTruthy());
    expect(onUpdatePrefs).toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('closes without writing when Cancel is pressed', () => {
    const { onUpdatePrefs } = renderSection({ searchEngineId: 'google' });
    const dialog = openEditor('searchEngineId');
    fireEvent.click(within(dialog).getByRole('button', { name: s.cancel }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(onUpdatePrefs).not.toHaveBeenCalled();
  });
});
