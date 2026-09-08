// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { I18nProvider } from '@tepegoz/i18n/react';
import { MacroBackupControls, type MacroBackupApi } from './macro-backup-controls';
import { en } from './i18n/en';

/**
 * The Export / Import controls on the "My Macros" surface. The renderer stays untrusted: main only
 * ever exchanges a STRING — the Blob download and the `<input type=file>` read happen here, exactly
 * like the bookmarks / history / preferences backup controls.
 */

function renderControls(
  over: {
    exportMacros?: MacroBackupApi['exportMacros'];
    importMacros?: MacroBackupApi['importMacros'];
  } = {},
) {
  const exportMacros = vi.fn(
    over.exportMacros ??
      (() => Promise.resolve('{"format":"tepegoz.macros","version":1,"macros":[]}')),
  );
  const importMacros = vi.fn(over.importMacros ?? (() => Promise.resolve({ imported: 0, skipped: 0 })));
  const onImported = vi.fn();
  render(
    <I18nProvider locale="en">
      <MacroBackupControls api={{ exportMacros, importMacros }} onImported={onImported} />
    </I18nProvider>,
  );
  return { exportMacros, importMacros, onImported };
}

afterEach(cleanup);

describe('MacroBackupControls — export', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('downloads the JSON the bridge returns via a blob link named tepegoz-macros.json', async () => {
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

    const { exportMacros } = renderControls();
    fireEvent.click(screen.getByRole('button', { name: en.exportMacros }));

    await waitFor(() => expect(exportMacros).toHaveBeenCalledTimes(1));
    expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    expect(click).toHaveBeenCalled();
    expect(anchor?.download).toBe('tepegoz-macros.json');
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:fake');
    vi.unstubAllGlobals();
  });
});

describe('MacroBackupControls — import', () => {
  it('sends the picked file text to the bridge and reports imported + skipped', async () => {
    const { importMacros, onImported } = renderControls({
      importMacros: () => Promise.resolve({ imported: 3, skipped: 2 }),
    });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = { text: () => Promise.resolve('{"macros":[]}') } as File;
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => expect(importMacros).toHaveBeenCalledWith('{"macros":[]}'));
    await screen.findByText(/Imported 3/);
    expect(screen.getByText(/2 skipped/)).toBeTruthy();
    expect(onImported).toHaveBeenCalledTimes(1);
  });

  it('shows the failure string when the import bridge rejects a bad file', async () => {
    renderControls({ importMacros: () => Promise.reject(new Error('bad request')) });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = { text: () => Promise.resolve('not json') } as File;
    fireEvent.change(input, { target: { files: [file] } });

    await screen.findByText(en.importFailed);
  });
});
