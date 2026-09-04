import { beforeEach, describe, expect, it, vi } from 'vitest';

const showSaveDialog = vi.fn();
const writeFile = vi.fn();
const push = vi.fn();
const activeWebContents = vi.fn();
const focusedWindow = vi.fn();

vi.mock('electron', () => ({
  app: { getPath: () => '/downloads' },
  dialog: { showSaveDialog: (...args: unknown[]) => showSaveDialog(...args) as unknown },
}));
vi.mock('node:fs/promises', () => ({
  writeFile: (...args: unknown[]) => writeFile(...args) as unknown,
}));
vi.mock('@tepegoz/libs', () => ({ Logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } }));
vi.mock('../notifications/notification-host', () => ({ default: { push } }));
vi.mock('../lib/i18n-main', () => ({
  mainStrings: () => ({
    browser: {
      pdfDefaultName: 'page',
      pdfSavedTitle: 'Saved as PDF',
      pdfFailedTitle: 'Could not save the PDF',
      pdfFailedBody: 'The page could not be written to that file.',
    },
  }),
}));
vi.mock('../tabs', () => ({
  default: {
    focused: () => ({ activeWebContents: () => activeWebContents() as unknown }),
    focusedWindow: () => focusedWindow() as unknown,
  },
}));

const { savePageAsPdf } = await import('./print-to-pdf.electron');

/**
 * "Save as PDF". The behaviours worth pinning are the ones a naive version gets wrong: doing the work
 * before asking where to put it, and — the failure mode this repo keeps finding — saying nothing when
 * the save did not happen.
 */
function fakePage(
  title: string,
  printToPDF: () => Promise<Buffer> = () => Promise.resolve(Buffer.from('%PDF')),
) {
  return {
    isDestroyed: () => false,
    getTitle: () => title,
    getURL: () => 'https://example.com/',
    printToPDF,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  activeWebContents.mockReturnValue(fakePage('Report'));
  focusedWindow.mockReturnValue({ isDestroyed: () => false });
  showSaveDialog.mockResolvedValue({ canceled: false, filePath: '/downloads/Report.pdf' });
  writeFile.mockResolvedValue(undefined);
});

describe('savePageAsPdf', () => {
  it('writes the rendered bytes to the path the user picked', async () => {
    await savePageAsPdf();
    expect(writeFile).toHaveBeenCalledWith('/downloads/Report.pdf', Buffer.from('%PDF'));
    expect(push).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Saved as PDF', kind: 'info' }),
    );
  });

  it('suggests a file name from the page title, in the downloads folder', async () => {
    await savePageAsPdf();
    const [, options] = showSaveDialog.mock.calls[0] as [unknown, { defaultPath: string }];
    expect(options.defaultPath).toContain('Report.pdf');
    expect(options.defaultPath).toContain('downloads');
  });

  it('sanitises the suggested name — the title is set by the PAGE', async () => {
    activeWebContents.mockReturnValue(fakePage('../../etc/passwd'));
    await savePageAsPdf();
    const [, options] = showSaveDialog.mock.calls[0] as [unknown, { defaultPath: string }];
    expect(options.defaultPath).not.toContain('..');
    expect(options.defaultPath).toContain('etc passwd.pdf');
  });

  it('asks for the path BEFORE rendering, so a cancel costs nothing', async () => {
    const printToPDF = vi.fn(() => Promise.resolve(Buffer.from('%PDF')));
    activeWebContents.mockReturnValue(fakePage('Report', printToPDF));
    showSaveDialog.mockResolvedValue({ canceled: true, filePath: undefined });

    await savePageAsPdf();

    expect(printToPDF).not.toHaveBeenCalled();
    expect(writeFile).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled(); // a cancel is not a failure, and must not be announced as one
  });

  it('treats an empty path from the dialog as a cancel', async () => {
    showSaveDialog.mockResolvedValue({ canceled: false, filePath: '' });
    await savePageAsPdf();
    expect(writeFile).not.toHaveBeenCalled();
  });

  it('SAYS SO when the write fails, rather than leaving the user looking for a file', async () => {
    writeFile.mockRejectedValue(new Error('EACCES'));
    await savePageAsPdf();
    expect(push).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Could not save the PDF', kind: 'error' }),
    );
  });

  it('says so when the PAGE cannot be rendered either', async () => {
    activeWebContents.mockReturnValue(
      fakePage('Report', () => Promise.reject(new Error('printing failed'))),
    );
    await savePageAsPdf();
    expect(writeFile).not.toHaveBeenCalled();
    expect(push).toHaveBeenCalledWith(expect.objectContaining({ kind: 'error' }));
  });

  it('uses a parent-less save dialog when no window is focused', async () => {
    focusedWindow.mockReturnValue(null);
    await savePageAsPdf();
    expect(showSaveDialog).toHaveBeenCalledWith({
      defaultPath: expect.stringContaining('Report.pdf') as string,
    });
    expect(showSaveDialog.mock.calls[0]).toHaveLength(1); // no BrowserWindow parent argument
    expect(writeFile).toHaveBeenCalledWith('/downloads/Report.pdf', Buffer.from('%PDF'));
  });

  it('does nothing at all with no page — no dialog, no throw', async () => {
    activeWebContents.mockReturnValue(null);
    await expect(savePageAsPdf()).resolves.toBeUndefined();
    expect(showSaveDialog).not.toHaveBeenCalled();
  });
});
