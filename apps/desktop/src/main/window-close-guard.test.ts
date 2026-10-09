import { beforeEach, describe, expect, it, vi } from 'vitest';

const dlg = vi.hoisted(() => ({ showMessageBox: vi.fn() }));
vi.mock('electron', () => ({ dialog: dlg }));
vi.mock('./lib/i18n-main', () => ({
  mainStrings: () => ({
    browser: {
      closeWindowTitle: 'Close this window?',
      closeWindowDetail: 'This will close {count} tabs.',
      closeWindowConfirm: 'Close tabs',
      closeWindowCancel: 'Keep open',
    },
  }),
}));

const { shouldConfirmClose, confirmCloseWindow } = await import('./window-close-guard');

const base = { enabled: true, closeToTray: false, quitting: false, tabCount: 3 };

describe('shouldConfirmClose', () => {
  it('asks for a multi-tab window that would really close', () => {
    expect(shouldConfirmClose(base)).toBe(true);
    expect(shouldConfirmClose({ ...base, tabCount: 2 })).toBe(true);
  });

  it.each([
    ['the setting is off', { enabled: false }],
    ['the app is quitting', { quitting: true }],
    ['close-to-tray only hides the window', { closeToTray: true }],
    ['there is a single tab', { tabCount: 1 }],
    ['there are no tabs', { tabCount: 0 }],
  ])('does not ask when %s', (_why, over) => {
    expect(shouldConfirmClose({ ...base, ...over })).toBe(false);
  });
});

describe('confirmCloseWindow', () => {
  beforeEach(() => {
    dlg.showMessageBox.mockReset();
  });

  it('closes only on the confirm button, defaulting to Keep open', async () => {
    dlg.showMessageBox.mockResolvedValue({ response: 0 });
    await expect(confirmCloseWindow({} as never, 4)).resolves.toBe(true);
    const opts = dlg.showMessageBox.mock.calls[0]![1] as Record<string, unknown>;
    expect(opts['detail']).toBe('This will close 4 tabs.');
    expect(opts['defaultId']).toBe(1);
    expect(opts['cancelId']).toBe(1);
  });

  it('keeps the window on Cancel/Esc and when the dialog throws', async () => {
    dlg.showMessageBox.mockResolvedValue({ response: 1 });
    await expect(confirmCloseWindow({} as never, 4)).resolves.toBe(false);
    dlg.showMessageBox.mockRejectedValue(new Error('window destroyed'));
    await expect(confirmCloseWindow({} as never, 4)).resolves.toBe(false);
  });
});
