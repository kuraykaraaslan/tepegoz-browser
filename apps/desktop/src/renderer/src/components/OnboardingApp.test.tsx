// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { DEFAULT_PREFERENCES } from '@tepegoz/preferences';
import type {
  BookmarkImportInput,
  BookmarkImportResult,
  DetectedBrowserProfile,
} from '@tepegoz/desktop-ipc';
import { onboardingDict } from '@tepegoz/onboarding-ui/i18n';
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
  importBookmarks: vi.fn<(input: BookmarkImportInput) => Promise<BookmarkImportResult>>(() =>
    Promise.resolve({ imported: 0, skipped: 0, folders: 0, errors: [], truncated: false }),
  ),
  detectBrowserProfiles: vi.fn<() => Promise<DetectedBrowserProfile[]>>(() => Promise.resolve([])),
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

  it('resolves the stored tr locale', async () => {
    bridge.getPreferences.mockResolvedValueOnce({ ...DEFAULT_PREFERENCES, locale: 'tr' });
    render(<OnboardingApp />);
    expect(await screen.findByRole('button', { name: onboardingDict.tr.begin })).toBeTruthy();
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

  it('detects browser profiles once the import step opens, and imports the one picked', async () => {
    const profile: DetectedBrowserProfile = {
      id: 'chrome:abc123',
      source: 'chrome',
      browserLabel: 'Chrome',
      profileName: 'Kuray',
      modifiedAt: 2,
    };
    bridge.detectBrowserProfiles.mockResolvedValueOnce([profile]);
    render(<OnboardingApp />);
    fireEvent.click(await screen.findByRole('button', { name: 'Begin' }));
    expect(bridge.detectBrowserProfiles).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => expect(bridge.detectBrowserProfiles).toHaveBeenCalledTimes(1));

    fireEvent.click(await screen.findByRole('button', { name: 'Import from Chrome — Kuray' }));
    await waitFor(() => expect(bridge.importBookmarkProfile).toHaveBeenCalledWith('chrome:abc123'));
  });

  it('imports bookmarks from a dropped HTML file', async () => {
    render(<OnboardingApp />);
    fireEvent.click(await screen.findByRole('button', { name: 'Begin' }));
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    const dropZone = await screen.findByRole('button', { name: /Choose bookmarks file/ });
    // jsdom's `File` has no `.text()`; a plain object with just that method satisfies the
    // handler's actual runtime use of the dropped file (it never touches any other File API).
    const file = { text: () => Promise.resolve('<html></html>') };
    fireEvent.drop(dropZone, { dataTransfer: { files: [file] } });
    await waitFor(() => expect(bridge.importBookmarks).toHaveBeenCalled());
    expect(bridge.importBookmarks.mock.calls[0]![0]).toMatchObject({
      format: 'html',
      data: '<html></html>',
    });
  });

  it('imports logins from a dropped CSV file', async () => {
    render(<OnboardingApp />);
    fireEvent.click(await screen.findByRole('button', { name: 'Begin' }));
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    const dropZone = await screen.findByRole('button', { name: /Choose password CSV/ });
    const file = { text: () => Promise.resolve('user,pass\n') };
    fireEvent.drop(dropZone, { dataTransfer: { files: [file] } });
    await waitFor(() =>
      expect(bridge.importLogins).toHaveBeenCalledWith('user,pass\n', 'generic-csv'),
    );
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
