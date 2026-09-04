// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { DEFAULT_PREFERENCES } from '@tepegoz/preferences';
import { stubJsdomLayout } from '../test-support/jsdom-layout';
import { OnboardingApp } from './OnboardingApp';

/**
 * Desktop host for the first-run onboarding package — it owns the Electron bridge/theme/window
 * concerns and threads them into `@tepegoz/onboarding-ui`. The package has its own flow tests; this
 * pins the wiring: prefs drive the locale/theme, the caption controls call the window bridge, and the
 * final step calls `completeOnboarding`.
 */

stubJsdomLayout();

const bridge = {
  getPreferences: vi.fn(() => Promise.resolve({ ...DEFAULT_PREFERENCES })),
  isWindowMaximized: vi.fn(() => Promise.resolve(false)),
  onWindowMaximizedChange: vi.fn(() => () => undefined),
  minimizeWindow: vi.fn(),
  toggleMaximizeWindow: vi.fn(),
  closeWindow: vi.fn(),
  platform: 'win32',
  importBookmarks: vi.fn(() => Promise.resolve({ imported: 0, skipped: 0, errors: [] })),
  detectBrowserProfiles: vi.fn(() => Promise.resolve([])),
  importBookmarkProfile: vi.fn(() => Promise.resolve({ imported: 0, skipped: 0, errors: [] })),
  importLogins: vi.fn(() => Promise.resolve({ imported: 0, skipped: 0, errors: [] })),
  completeOnboarding: vi.fn(() => Promise.resolve()),
};

beforeEach(() => {
  vi.clearAllMocks();
  bridge.getPreferences.mockResolvedValue({ ...DEFAULT_PREFERENCES });
  bridge.isWindowMaximized.mockResolvedValue(false);
  vi.stubGlobal('matchMedia', (q: string) => ({
    matches: false,
    media: q,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
  Object.defineProperty(window, 'tepegoz', { configurable: true, value: bridge });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('OnboardingApp', () => {
  it('reads preferences on mount and renders the onboarding surface', async () => {
    render(<OnboardingApp />);
    await waitFor(() => expect(bridge.getPreferences).toHaveBeenCalled());
    expect(screen.getByRole('button', { name: 'Begin' })).toBeTruthy();
  });

  it('survives a rejected preferences read (defaults keep the surface usable)', async () => {
    bridge.getPreferences.mockRejectedValueOnce(new Error('prefs gone'));
    render(<OnboardingApp />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Begin' })).toBeTruthy());
  });

  it('wires the caption controls to the window bridge', async () => {
    render(<OnboardingApp />);
    await screen.findByRole('button', { name: 'Begin' });
    fireEvent.click(screen.getByRole('button', { name: 'Minimize' }));
    fireEvent.click(screen.getByRole('button', { name: 'Maximize' }));
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(bridge.minimizeWindow).toHaveBeenCalledTimes(1);
    expect(bridge.toggleMaximizeWindow).toHaveBeenCalledTimes(1);
    expect(bridge.closeWindow).toHaveBeenCalledTimes(1);
  });

  it('calls completeOnboarding when the user finishes the flow', async () => {
    render(<OnboardingApp />);
    fireEvent.click(await screen.findByRole('button', { name: 'Begin' }));
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    fireEvent.click(screen.getByRole('button', { name: 'Skip import' }));
    fireEvent.click(screen.getByRole('button', { name: 'Start browsing' }));
    await waitFor(() => expect(bridge.completeOnboarding).toHaveBeenCalledTimes(1));
  });
});
