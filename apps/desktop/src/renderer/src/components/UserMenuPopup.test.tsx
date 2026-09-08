// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { DEFAULT_PREFERENCES } from '@tepegoz/preferences';
import { INTERNAL_PROFILES_URL } from '@tepegoz/desktop-ipc';
import type { Profile } from '@tepegoz/desktop-ipc';
import { userMenuDict } from '../../../i18n';
import { stubJsdomLayout } from '../test-support/jsdom-layout';
import { UserMenuPopup } from './UserMenuPopup';

/**
 * The standalone user (profile) menu popup window. Wired to the profile registry (ADR-0045): the
 * header names this window's profile, "Other profiles" lists the rest, and Add / Manage / New window
 * act. What is worth pinning is the host behaviour (reports its height, closes on Escape) plus the
 * wiring of each live row.
 */

stubJsdomLayout();

const profile = (over: Partial<Profile> = {}): Profile => ({
  id: 'default',
  name: 'Ada',
  colorId: 0,
  createdAt: 1,
  lastUsedAt: 1,
  ...over,
});

const bridge = {
  getPreferences: vi.fn(() => Promise.resolve({ ...DEFAULT_PREFERENCES })),
  resizePopup: vi.fn(),
  closePopup: vi.fn(),
  listProfiles: vi.fn(() =>
    Promise.resolve([profile(), profile({ id: 'profile-1', name: 'Bob', colorId: 1 })]),
  ),
  getActiveProfile: vi.fn(() => Promise.resolve<Profile | null>(profile())),
  createProfile: vi.fn(() => Promise.resolve(profile({ id: 'profile-2', name: 'Profile 3' }))),
  switchProfile: vi.fn(() => Promise.resolve()),
  newWindow: vi.fn(),
  navigateTab: vi.fn(),
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
    expect(screen.getByRole('menu')).toBeTruthy();
  });

  it('names the active profile in the header and lists the others', async () => {
    render(<UserMenuPopup />);
    expect(await screen.findByText('Bob')).toBeTruthy(); // an "other profile" row
    expect(screen.getAllByText('Ada').length).toBeGreaterThan(0); // the header
  });

  it('switches to another profile and closes', async () => {
    render(<UserMenuPopup />);
    fireEvent.click(await screen.findByText('Bob'));
    expect(bridge.switchProfile).toHaveBeenCalledWith('profile-1');
    expect(bridge.closePopup).toHaveBeenCalled();
  });

  it('opens the profile manager from "Manage profiles"', async () => {
    render(<UserMenuPopup />);
    fireEvent.click(await screen.findByText(userMenuDict.en.manageProfiles));
    expect(bridge.navigateTab).toHaveBeenCalledWith(INTERNAL_PROFILES_URL);
  });

  it('adds a profile and switches straight into it', async () => {
    render(<UserMenuPopup />);
    fireEvent.click(await screen.findByText(userMenuDict.en.addProfile));
    await waitFor(() => expect(bridge.createProfile).toHaveBeenCalled());
    await waitFor(() => expect(bridge.switchProfile).toHaveBeenCalledWith('profile-2'));
  });

  it('keeps passwords / account / sync as disabled placeholders', async () => {
    render(<UserMenuPopup />);
    await screen.findByText('Bob');
    for (const label of [
      userMenuDict.en.passwords,
      userMenuDict.en.manageAccount,
      userMenuDict.en.sync,
      userMenuDict.en.guestProfile,
    ]) {
      const row = screen.getByText(label).closest('button, [role="menuitem"]');
      expect(
        (row as HTMLButtonElement).disabled || row?.getAttribute('aria-disabled') === 'true',
      ).toBe(true);
    }
  });
});
