// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { I18nProvider } from '@tepegoz/i18n/react';
import { settingsDict } from '@tepegoz/settings-ui';
import { coreDict } from '@tepegoz/i18n';
import type { LocalModelInfo } from '@tepegoz/desktop-ipc';
import { LocalModelsSection } from './settings-ai-panels-models';

/**
 * On-device models panel. What it must not fake: the size line degrades honestly (live total → bytes
 * so far → "unknown"), every bridge action reports main's localized failure instead of swallowing it,
 * and Delete is a two-step confirm. Buttons are transport-gated on `downloading`/`installed`/`selected`.
 */

const s = settingsDict.en;
const c = coreDict.en;

let stateCb: (m: LocalModelInfo[]) => void = () => {};

const bridge = {
  listLocalModels: vi.fn<() => Promise<LocalModelInfo[]>>(() => Promise.resolve([])),
  onLocalModelsState: vi.fn((cb: (m: LocalModelInfo[]) => void) => {
    stateCb = cb;
    return () => undefined;
  }),
  downloadLocalModel: vi.fn(() => Promise.resolve()),
  cancelLocalModelDownload: vi.fn(),
  selectLocalModel: vi.fn(() => Promise.resolve()),
  deleteLocalModel: vi.fn(() => Promise.resolve()),
};

function model(over: Partial<LocalModelInfo> = {}): LocalModelInfo {
  return {
    id: 'm1',
    name: 'Qwen 7B',
    paramsB: 7,
    ctx: 32768,
    license: 'apache-2.0',
    recommended: false,
    installed: false,
    downloading: false,
    progress: 0,
    downloadedBytes: 0,
    totalBytes: 0,
    selected: false,
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  bridge.listLocalModels.mockResolvedValue([]);
  Object.defineProperty(window, 'tepegoz', { configurable: true, value: bridge });
});
afterEach(cleanup);

function renderSection() {
  render(
    <I18nProvider locale="en">
      <LocalModelsSection />
    </I18nProvider>,
  );
}

describe('LocalModelsSection', () => {
  it('shows the empty state and degrades to [] when the list call rejects', async () => {
    bridge.listLocalModels.mockRejectedValueOnce(new Error('offline'));
    renderSection();
    await waitFor(() => expect(screen.getByText(s.localModels.empty)).toBeTruthy());
  });

  it('renders a not-installed row with a catalogued size and a Download button', async () => {
    bridge.listLocalModels.mockResolvedValue([model({ sizeBytes: 4 * 1024 * 1024 * 1024 })]);
    renderSection();
    await screen.findByText('Qwen 7B');
    expect(screen.getByText(/4\.0 GB/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: s.localModels.download }));
    expect(bridge.downloadLocalModel).toHaveBeenCalledWith('m1');
  });

  it('surfaces main\'s error message when an action rejects', async () => {
    bridge.listLocalModels.mockResolvedValue([model()]);
    bridge.downloadLocalModel.mockRejectedValueOnce(new Error('model link is dead'));
    renderSection();
    await screen.findByText('Qwen 7B');
    fireEvent.click(screen.getByRole('button', { name: s.localModels.download }));
    await waitFor(() => expect(screen.getByText('model link is dead')).toBeTruthy());
  });

  it('falls back to the generic upstream message when the rejection carries none', async () => {
    bridge.listLocalModels.mockResolvedValue([model()]);
    bridge.downloadLocalModel.mockRejectedValueOnce(new Error(''));
    renderSection();
    await screen.findByText('Qwen 7B');
    fireEvent.click(screen.getByRole('button', { name: s.localModels.download }));
    await waitFor(() => expect(screen.getByText(c.errors.upstreamDown)).toBeTruthy());
  });

  it('a downloading row shows live progress and a Cancel button', async () => {
    bridge.listLocalModels.mockResolvedValue([
      model({
        downloading: true,
        progress: 0.42,
        downloadedBytes: 500 * 1024 * 1024,
        totalBytes: 4 * 1024 * 1024 * 1024,
      }),
    ]);
    renderSection();
    await screen.findByText('Qwen 7B');
    expect(screen.getByText(/500 MB \/ 4\.0 GB/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: c.common.cancel }));
    expect(bridge.cancelLocalModelDownload).toHaveBeenCalledWith('m1');
  });

  it('a downloading row with no server total yet shows just the bytes so far', async () => {
    bridge.listLocalModels.mockResolvedValue([
      model({ downloading: true, downloadedBytes: 10 * 1024 * 1024, totalBytes: 0 }),
    ]);
    renderSection();
    await screen.findByText('Qwen 7B');
    expect(screen.getByText(/10\.0 MB/)).toBeTruthy();
  });

  it('a downloading row with nothing measured yet says "unknown"', async () => {
    bridge.listLocalModels.mockResolvedValue([
      model({ downloading: true, downloadedBytes: 0, totalBytes: 0 }),
    ]);
    renderSection();
    await screen.findByText('Qwen 7B');
    expect(screen.getAllByText(new RegExp(s.localModels.sizeUnknown)).length).toBeGreaterThan(0);
  });

  it('an installed non-selected row offers Use (which reselects and relists) and a confirmed Delete', async () => {
    bridge.listLocalModels.mockResolvedValue([
      model({ installed: true, selected: false, recommended: true, installedBytes: 3.9 * 1024 * 1024 * 1024 }),
    ]);
    bridge.listLocalModels.mockResolvedValueOnce([
      model({ installed: true, selected: false, recommended: true, installedBytes: 3.9 * 1024 * 1024 * 1024 }),
    ]);
    renderSection();
    await screen.findByText('Qwen 7B');
    expect(screen.getByText(s.localModels.recommended)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: s.localModels.use }));
    await waitFor(() => expect(bridge.selectLocalModel).toHaveBeenCalledWith('m1'));

    // Delete is a ConfirmAction: first press opens the dialog, second confirms.
    fireEvent.click(screen.getByRole('button', { name: s.localModels.delete }));
    const confirms = screen.getAllByRole('button', { name: s.localModels.delete });
    fireEvent.click(confirms[confirms.length - 1]!);
    await waitFor(() => expect(bridge.deleteLocalModel).toHaveBeenCalledWith('m1'));
  });

  it('an installed selected row shows the Selected badge and no Use button', async () => {
    bridge.listLocalModels.mockResolvedValue([
      model({ installed: true, selected: true, license: '' }),
    ]);
    renderSection();
    await screen.findByText('Qwen 7B');
    expect(screen.getByText(s.localModels.selected)).toBeTruthy();
    expect(screen.queryByRole('button', { name: s.localModels.use })).toBeNull();
  });

  it('reflects a pushed state update from onLocalModelsState', async () => {
    renderSection();
    await waitFor(() => expect(bridge.onLocalModelsState).toHaveBeenCalled());
    stateCb([model({ name: 'Pushed model' })]);
    await waitFor(() => expect(screen.getByText('Pushed model')).toBeTruthy());
  });
});
