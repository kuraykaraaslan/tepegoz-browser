// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { settingsDict } from '@tepegoz/settings-ui';
import type { BrowsingDataCategory, BrowsingDataClearResult } from '@tepegoz/shared-types';
import { ClearBrowsingDataRow, ClearOnExitRow } from './ClearBrowsingDataRow';

/**
 * The unified "Clear browsing data" dialog (Phase 2c L8) and the "clear on exit" category picker.
 * Honesty rules under test: the result is COUNTS, never "Done"; a category that could not be cleared
 * is named; the confirm button is dead with nothing selected; cookies/cache carry the "time range
 * does not apply" note because the engine has no time-scoped clear for them; and the request the
 * bridge receives is exactly the chosen range + categories.
 */

const s = settingsDict.en;

const result = (over: Partial<BrowsingDataClearResult> = {}): BrowsingDataClearResult => ({
  range: 'last-hour',
  historyEntries: 12,
  downloadEntries: 3,
  agentConversations: 1,
  cookiePartitions: 2,
  cachePartitions: 2,
  failed: [],
  ...over,
});

const clearBrowsingData = vi.fn();

beforeEach(() => {
  clearBrowsingData.mockReset().mockResolvedValue(result());
  Object.defineProperty(window, 'tepegoz', { configurable: true, value: { clearBrowsingData } });
});
afterEach(cleanup);

describe('ClearOnExitRow', () => {
  function renderRow(selected: BrowsingDataCategory[] = []) {
    const onChange = vi.fn();
    render(<ClearOnExitRow s={s} selected={selected} onChange={onChange} />);
    return { onChange };
  }

  it('adds an unchecked category on toggle', () => {
    const { onChange } = renderRow([]);
    fireEvent.click(screen.getByRole('checkbox', { name: /browsing history/i }));
    expect(onChange).toHaveBeenCalledWith(['history']);
  });

  it('removes a checked category on toggle', () => {
    const { onChange } = renderRow(['history', 'cookies']);
    fireEvent.click(screen.getByRole('checkbox', { name: /browsing history/i }));
    expect(onChange).toHaveBeenCalledWith(['cookies']);
  });
});

describe('ClearBrowsingDataRow', () => {
  const openDialog = () => {
    render(<ClearBrowsingDataRow s={s} />);
    fireEvent.click(screen.getByRole('button', { name: s.clearData.open }));
  };

  it('opens the dialog from the row button', () => {
    openDialog();
    expect(screen.getByText(s.clearData.categoriesLabel)).toBeTruthy();
  });

  it('shows the "time range does not apply" note against cookies and cache only', () => {
    openDialog();
    // history/downloads/agentHistory are time-rangeable; cookies + cache are not → exactly 2 notes
    expect(screen.getAllByText(s.clearData.allTimeOnly)).toHaveLength(2);
  });

  it('disables confirm once every category is unchecked', () => {
    openDialog();
    for (const name of [/browsing history/i, /cookies and site data/i, /cached files/i]) {
      fireEvent.click(screen.getByRole('checkbox', { name }));
    }
    const confirm = screen.getByRole<HTMLButtonElement>('button', { name: s.clearData.confirm });
    expect(confirm.disabled).toBe(true);
  });

  it('sends the chosen range and categories to the bridge', async () => {
    openDialog();
    fireEvent.change(screen.getByLabelText(s.clearData.rangeLabel), {
      target: { value: 'last-week' },
    });
    fireEvent.click(screen.getByRole('button', { name: s.clearData.confirm }));
    await waitFor(() => expect(clearBrowsingData).toHaveBeenCalledTimes(1));
    expect(clearBrowsingData).toHaveBeenCalledWith({
      range: 'last-week',
      categories: ['history', 'cookies', 'cache'],
    });
  });

  it('reports counts, not "Done", after a successful clear', async () => {
    openDialog();
    fireEvent.click(screen.getByRole('button', { name: s.clearData.confirm }));
    await waitFor(() => expect(screen.getByText(/12 history entries/)).toBeTruthy());
  });

  it('names a category that could not be cleared', async () => {
    clearBrowsingData.mockResolvedValue(result({ failed: ['cookies'] }));
    openDialog();
    fireEvent.click(screen.getByRole('button', { name: s.clearData.confirm }));
    // t.failed is "Could not clear: {categories}." with the localized cookie label spliced in.
    const failedPrefix = s.clearData.failed.split('{categories}')[0]!;
    await waitFor(() => expect(screen.getByText(new RegExp(failedPrefix))).toBeTruthy());
  });

  it('shows the error line when the clear rejects', async () => {
    clearBrowsingData.mockRejectedValue(new Error('engine down'));
    openDialog();
    fireEvent.click(screen.getByRole('button', { name: s.clearData.confirm }));
    await waitFor(() => expect(screen.getByText(s.clearData.error)).toBeTruthy());
  });

  it('closes the dialog on Cancel', () => {
    openDialog();
    fireEvent.click(screen.getByRole('button', { name: s.cancel }));
    expect(screen.queryByText(s.clearData.categoriesLabel)).toBeNull();
  });

  it('closes the dialog on Escape', () => {
    openDialog();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByText(s.clearData.categoriesLabel)).toBeNull();
  });
});
