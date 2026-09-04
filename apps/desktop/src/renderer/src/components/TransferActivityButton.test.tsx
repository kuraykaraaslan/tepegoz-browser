// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { I18nProvider } from '@tepegoz/i18n/react';
import type { DownloadRecord } from '@tepegoz/downloads';
import { TransferActivityButton } from './TransferActivityButton';

/**
 * The nav-toolbar transfers button. Coverage focus:
 *  - it is absent while there is nothing to show and the panel is closed;
 *  - the "active" badge counts in-flight downloads AND uploads and clamps at "9+";
 *  - clicking toggles the native popup;
 *  - `announceFinished` opens the panel exactly once when a transfer REACHES an ending we care about
 *    and the private `showDownloadsWhenDone` preference asks for it — never for a download that was
 *    already finished when the chrome mounted, and never when the preference is off.
 */

type DownloadsListener = (state: { items: DownloadRecord[] }) => void;
type PopupClosedListener = (surface: string) => void;

let downloadsListener: DownloadsListener = () => {};
let popupClosedListener: PopupClosedListener = () => {};
let prefs: { showDownloadsWhenDone: boolean };

const bridge = {
  listDownloads: vi.fn(() => Promise.resolve<DownloadRecord[]>([])),
  listUploads: vi.fn(() => Promise.resolve([])),
  onDownloadsState: vi.fn((cb: DownloadsListener) => {
    downloadsListener = cb;
    return () => {};
  }),
  onUploadsState: vi.fn(() => () => {}),
  onPopupClosed: vi.fn((cb: PopupClosedListener) => {
    popupClosedListener = cb;
    return () => {};
  }),
  openPopup: vi.fn(),
  closePopup: vi.fn(),
  getPreferences: vi.fn(() => Promise.resolve(prefs)),
};

function dl(id: string, status: DownloadRecord['status']): DownloadRecord {
  return {
    id,
    url: `https://example/${id}`,
    filename: `${id}.bin`,
    status,
    risk: 'normal',
    trustVerdict: 'safe',
    receivedBytes: 0,
    totalBytes: null,
    canResume: false,
    createdAt: 0,
    updatedAt: 0,
    provenance: { actor: 'user' },
  };
}

function renderButton() {
  return render(
    <I18nProvider locale="en">
      <TransferActivityButton />
    </I18nProvider>,
  );
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  prefs = { showDownloadsWhenDone: true };
  bridge.listDownloads.mockResolvedValue([]);
  bridge.listUploads.mockResolvedValue([]);
  bridge.getPreferences.mockImplementation(() => Promise.resolve(prefs));
  Object.defineProperty(window, 'tepegoz', { configurable: true, value: bridge });
});
afterEach(cleanup);

describe('TransferActivityButton', () => {
  it('renders nothing while there are no transfers and the panel is closed', async () => {
    const { container } = renderButton();
    await flush();
    expect(container.firstChild).toBeNull();
  });

  it('shows the active-transfer count and clamps it at "9+"', async () => {
    bridge.listDownloads.mockResolvedValue(
      Array.from({ length: 12 }, (_, i) => dl(`d${i}`, 'in_progress')),
    );
    renderButton();
    await flush();
    expect(screen.getByRole('button').textContent).toContain('9+');
  });

  it('does not count a completed download as active', async () => {
    bridge.listDownloads.mockResolvedValue([dl('d1', 'completed'), dl('d2', 'in_progress')]);
    renderButton();
    await flush();
    // one active → exact number, not the clamp
    expect(screen.getByRole('button').textContent).toContain('1');
  });

  it('counts an in-flight upload as active alongside downloads', async () => {
    bridge.listUploads.mockResolvedValue([
      { id: 'u1', status: 'staged' },
      { id: 'u2', status: 'submitting' },
      { id: 'u3', status: 'done' },
    ] as unknown as never[]);
    renderButton();
    await flush();
    // two active uploads, no downloads → exact count
    expect(screen.getByRole('button').textContent).toContain('2');
  });

  it('swallows a rejected getPreferences when a transfer finishes (no panel, no throw)', async () => {
    bridge.getPreferences.mockRejectedValue(new Error('bridge unavailable'));
    renderButton();
    await flush();

    act(() => downloadsListener({ items: [dl('d1', 'in_progress')] }));
    act(() => downloadsListener({ items: [dl('d1', 'completed')] }));
    await flush();

    expect(bridge.getPreferences).toHaveBeenCalled();
    expect(bridge.openPopup).not.toHaveBeenCalled();
  });

  it('toggles the native popup open and closed on click', async () => {
    bridge.listDownloads.mockResolvedValue([dl('d1', 'in_progress')]);
    renderButton();
    await flush();
    const button = screen.getByRole('button');

    fireEvent.click(button);
    expect(bridge.openPopup).toHaveBeenCalledWith('transfers', expect.any(Object), expect.any(Object));
    expect(button.getAttribute('aria-expanded')).toBe('true');

    fireEvent.click(button);
    expect(bridge.closePopup).toHaveBeenCalledTimes(1);
    expect(button.getAttribute('aria-expanded')).toBe('false');
  });

  it('syncs aria-expanded back when main reports the popup closed', async () => {
    bridge.listDownloads.mockResolvedValue([dl('d1', 'in_progress')]);
    renderButton();
    await flush();
    const button = screen.getByRole('button');
    fireEvent.click(button);
    expect(button.getAttribute('aria-expanded')).toBe('true');

    act(() => popupClosedListener('transfers'));
    expect(button.getAttribute('aria-expanded')).toBe('false');
  });

  it('opens the panel when a tracked download transitions to completed and the pref is on', async () => {
    renderButton();
    await flush();

    act(() => downloadsListener({ items: [dl('d1', 'in_progress')] }));
    act(() => downloadsListener({ items: [dl('d1', 'completed')] }));
    await flush();

    expect(bridge.getPreferences).toHaveBeenCalled();
    expect(bridge.openPopup).toHaveBeenCalledWith('transfers', expect.any(Object), expect.any(Object));
  });

  it('does NOT open the panel for a download that was already finished on mount', async () => {
    renderButton();
    await flush();

    // First time we ever see d1 it is already `completed` — restoring history is not an event.
    act(() => downloadsListener({ items: [dl('d1', 'completed')] }));
    await flush();

    expect(bridge.openPopup).not.toHaveBeenCalled();
  });

  it('does NOT open the panel when showDownloadsWhenDone is off', async () => {
    prefs = { showDownloadsWhenDone: false };
    renderButton();
    await flush();

    act(() => downloadsListener({ items: [dl('d1', 'in_progress')] }));
    act(() => downloadsListener({ items: [dl('d1', 'completed')] }));
    await flush();

    expect(bridge.getPreferences).toHaveBeenCalled();
    expect(bridge.openPopup).not.toHaveBeenCalled();
  });
});
