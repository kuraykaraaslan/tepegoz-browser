// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { DEFAULT_PREFERENCES } from '@tepegoz/preferences';
import { userMenuDict } from '../../../i18n';
import { stubJsdomLayout } from '../test-support/jsdom-layout';
import { UserMenuPopup } from './UserMenuPopup';

/**
 * The standalone user (profile) menu popup window. A placeholder — every row is disabled — so what is
 * worth pinning is the host behaviour: it reports its measured content height back to the native
 * window (`resizePopup`), closes on Escape, and renders the profile card.
 */

stubJsdomLayout();

const bridge = {
  getPreferences: vi.fn(() => Promise.resolve({ ...DEFAULT_PREFERENCES })),
  resizePopup: vi.fn(),
  closePopup: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  bridge.getPreferences.mockResolvedValue({ ...DEFAULT_PREFERENCES });
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
  Object.defineProperty(window, 'tepegoz', { configurable: true, value: bridge });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('UserMenuPopup', () => {
  it('reports its content height back to the native window', async () => {
    render(<UserMenuPopup />);
    await waitFor(() => expect(bridge.resizePopup).toHaveBeenCalled());
    expect(typeof bridge.resizePopup.mock.calls[0]![0]).toBe('number');
  });

  it('closes the popup on Escape', () => {
    render(<UserMenuPopup />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(bridge.closePopup).toHaveBeenCalledTimes(1);
  });

  it('still renders when getPreferences rejects (bridge unavailable → defaults)', async () => {
    bridge.getPreferences.mockRejectedValueOnce(new Error('bridge unavailable'));
    render(<UserMenuPopup />);
    await waitFor(() => expect(bridge.resizePopup).toHaveBeenCalled());
    expect(screen.getAllByText(userMenuDict.en.name).length).toBeGreaterThan(0);
  });

  it('resolves the stored tr locale', async () => {
    bridge.getPreferences.mockResolvedValue({ ...DEFAULT_PREFERENCES, locale: 'tr' });
    render(<UserMenuPopup />);
    expect((await screen.findAllByText(userMenuDict.tr.name)).length).toBeGreaterThan(0);
  });

  it('renders the profile card with the placeholder identity', () => {
    render(<UserMenuPopup />);
    expect(screen.getAllByText(userMenuDict.en.name).length).toBeGreaterThan(0);
  });

  it('renders every profile row disabled (nothing wired yet)', () => {
    render(<UserMenuPopup />);
    const rows = screen.getAllByRole('menuitem');
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => (r as HTMLButtonElement).disabled || r.getAttribute('aria-disabled') === 'true')).toBe(true);
  });
});
