// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { I18nProvider } from '@tepegoz/i18n/react';
import { settingsDict } from '@tepegoz/settings-ui';
import { DEFAULT_PREFERENCES } from '@tepegoz/preferences';
import type { FileAccessGrant, Preferences } from '@tepegoz/desktop-ipc';
import { FileOperationsSection } from './settings-privacy-files-file-ops';

/**
 * The folder whitelist that sandboxes the assistant's file tools. Under test: a picked folder is
 * appended with the safe default grant (read / recursive), a folder already in the list (or repeated
 * in one pick) is refused with a warning rather than duplicated, per-grant edits and removal write
 * back, and with the master switch off the "add folder" affordance is genuinely disabled.
 */

const s = settingsDict.en;
const f = s.fileOps;
const pickFileAccessFolder = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(window, 'tepegoz', {
    configurable: true,
    value: { pickFileAccessFolder },
  });
});
afterEach(cleanup);

function renderSection(over: Partial<Preferences> = {}) {
  const setPref = vi.fn();
  render(
    <I18nProvider locale="en">
      <FileOperationsSection prefs={{ ...DEFAULT_PREFERENCES, ...over }} setPref={setPref} />
    </I18nProvider>,
  );
  return { setPref };
}

const grant = (path: string): FileAccessGrant => ({ path, mode: 'read', recursive: true });

const lastGrants = (setPref: ReturnType<typeof vi.fn>): FileAccessGrant[] =>
  (setPref.mock.calls.at(-1)![0] as Partial<Preferences>).fileAccessGrants as FileAccessGrant[];

describe('FileOperationsSection', () => {
  it('shows the empty state and disables "add folder" when file operations are off', () => {
    renderSection({ fileOperationsEnabled: false, fileAccessGrants: [] });
    expect(screen.getByText(f.noFolders)).toBeTruthy();
    expect(screen.getByRole<HTMLButtonElement>('button', { name: f.addFolder }).disabled).toBe(
      true,
    );
  });

  it('appends a picked folder as a read / recursive grant', async () => {
    pickFileAccessFolder.mockResolvedValue({ cancelled: false, paths: ['/home/docs'] });
    const { setPref } = renderSection({ fileAccessGrants: [] });
    fireEvent.click(screen.getByRole('button', { name: f.addFolder }));
    await vi.waitFor(() => expect(setPref).toHaveBeenCalled());
    expect(lastGrants(setPref)).toEqual([{ path: '/home/docs', mode: 'read', recursive: true }]);
  });

  it('refuses a folder already in the list and warns instead of duplicating', async () => {
    pickFileAccessFolder.mockResolvedValue({ cancelled: false, paths: ['/home/docs'] });
    const { setPref } = renderSection({ fileAccessGrants: [grant('/home/docs')] });
    fireEvent.click(screen.getByRole('button', { name: f.addFolder }));
    await vi.waitFor(() => expect(screen.getByText(f.duplicate)).toBeTruthy());
    expect(setPref).not.toHaveBeenCalled();
  });

  it('dedupes repeats within a single pick', async () => {
    pickFileAccessFolder.mockResolvedValue({
      cancelled: false,
      paths: ['/a', '/a', '/b'],
    });
    const { setPref } = renderSection({ fileAccessGrants: [] });
    fireEvent.click(screen.getByRole('button', { name: f.addFolder }));
    await vi.waitFor(() => expect(setPref).toHaveBeenCalled());
    expect(lastGrants(setPref).map((g) => g.path)).toEqual(['/a', '/b']);
  });

  it('does nothing when the folder picker is cancelled', async () => {
    pickFileAccessFolder.mockResolvedValue({ cancelled: true, paths: [] });
    const { setPref } = renderSection({ fileAccessGrants: [] });
    fireEvent.click(screen.getByRole('button', { name: f.addFolder }));
    await Promise.resolve();
    expect(setPref).not.toHaveBeenCalled();
  });

  it('writes back a per-grant recursive change', () => {
    const { setPref } = renderSection({ fileAccessGrants: [grant('/home/docs')] });
    fireEvent.click(screen.getByRole('checkbox', { name: f.recursive }));
    expect(lastGrants(setPref)[0]).toMatchObject({ path: '/home/docs', recursive: false });
  });

  it('writes back a per-grant access-mode change', () => {
    const { setPref } = renderSection({ fileAccessGrants: [grant('/home/docs')] });
    fireEvent.change(screen.getByLabelText(`/home/docs — ${f.modeLabel}`), {
      target: { value: 'read-write' },
    });
    expect(lastGrants(setPref)[0]).toMatchObject({ path: '/home/docs', mode: 'read-write' });
  });

  it('widens one folder to read-write without touching the others', () => {
    // Every edit case above has a single grant in the list, so each one matched and the untouched
    // arm never ran. This is the whitelist that sandboxes the assistant's file tools: an edit that
    // rewrote a sibling grant would silently widen access to a folder the user did not touch.
    const docs = grant('/home/docs');
    const photos = grant('/home/photos');
    const { setPref } = renderSection({ fileAccessGrants: [docs, photos] });

    fireEvent.change(screen.getByLabelText(`/home/photos — ${f.modeLabel}`), {
      target: { value: 'read-write' },
    });

    const next = lastGrants(setPref);
    expect(next[1]).toMatchObject({ path: '/home/photos', mode: 'read-write' });
    expect(next[0]).toBe(docs); // untouched grants pass through by identity, not as rebuilt copies
  });

  it('writes the master file-operations toggle', () => {
    const { setPref } = renderSection({ fileOperationsEnabled: false, fileAccessGrants: [] });
    fireEvent.click(screen.getByTestId('toggle-file-ops-enabled'));
    expect(setPref).toHaveBeenCalledWith({ fileOperationsEnabled: true });
  });

  it('removes a grant through the confirm dialog', () => {
    const { setPref } = renderSection({ fileAccessGrants: [grant('/home/docs')] });
    fireEvent.click(screen.getByRole('button', { name: f.remove }));
    const removeButtons = screen.getAllByRole('button', { name: f.remove });
    fireEvent.click(removeButtons[removeButtons.length - 1]!);
    expect(lastGrants(setPref)).toEqual([]);
  });
});
