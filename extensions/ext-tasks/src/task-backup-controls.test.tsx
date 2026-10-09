// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { I18nProvider } from '@tepegoz/i18n/react';
import { TaskBackupControls, type TaskBackupApi } from './task-backup-controls';
import { en } from './i18n/en';

/**
 * The Export / Import controls on the "Scheduled tasks" surface. The renderer stays untrusted: main
 * only ever exchanges a STRING — the Blob download and the `<input type=file>` read happen here, exactly
 * like the macros backup controls this mirrors.
 */

function renderControls(
  over: {
    exportTasks?: TaskBackupApi['exportTasks'];
    importTasks?: TaskBackupApi['importTasks'];
  } = {},
) {
  const exportTasks = vi.fn(
    over.exportTasks ??
      (() => Promise.resolve('{"format":"tepegoz.tasks","version":1,"tasks":[]}')),
  );
  const importTasks = vi.fn(
    over.importTasks ?? (() => Promise.resolve({ imported: 0, skipped: 0 })),
  );
  const onImported = vi.fn();
  render(
    <I18nProvider locale="en">
      <TaskBackupControls api={{ exportTasks, importTasks }} onImported={onImported} />
    </I18nProvider>,
  );
  return { exportTasks, importTasks, onImported };
}

afterEach(cleanup);

describe('TaskBackupControls — export', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('downloads the JSON the bridge returns via a blob link named tepegoz-tasks.json', async () => {
    const createObjectURL = vi.fn(() => 'blob:fake');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL });
    const click = vi.fn();
    const realCreate = document.createElement.bind(document);
    let anchor: HTMLAnchorElement | undefined;
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = realCreate(tag);
      if (tag === 'a') {
        el.click = click;
        anchor = el as HTMLAnchorElement;
      }
      return el;
    });

    const { exportTasks } = renderControls();
    fireEvent.click(screen.getByRole('button', { name: en.exportTasks }));

    await waitFor(() => expect(exportTasks).toHaveBeenCalledTimes(1));
    expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    expect(click).toHaveBeenCalled();
    expect(anchor?.download).toBe('tepegoz-tasks.json');
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:fake');
    vi.unstubAllGlobals();
  });
});

describe('TaskBackupControls — import', () => {
  it('sends the picked file text to the bridge and reports imported + skipped', async () => {
    const { importTasks, onImported } = renderControls({
      importTasks: () => Promise.resolve({ imported: 3, skipped: 2 }),
    });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = { text: () => Promise.resolve('{"tasks":[]}') } as File;
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => expect(importTasks).toHaveBeenCalledWith('{"tasks":[]}'));
    await screen.findByText(/Imported 3/);
    expect(screen.getByText(/2 skipped/)).toBeTruthy();
    expect(onImported).toHaveBeenCalledTimes(1);
  });

  it('shows the failure string when the import bridge rejects a bad file', async () => {
    renderControls({ importTasks: () => Promise.reject(new Error('bad request')) });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = { text: () => Promise.resolve('not json') } as File;
    fireEvent.change(input, { target: { files: [file] } });

    await screen.findByText(en.importFailed);
  });
});
