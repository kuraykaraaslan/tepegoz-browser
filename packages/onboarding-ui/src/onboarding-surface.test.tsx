// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { I18nProvider } from '@tepegoz/i18n/react';
import { OnboardingSurface, type OnboardingSurfaceProps } from './onboarding-surface';

afterEach(cleanup);

function props(overrides: Partial<OnboardingSurfaceProps> = {}): OnboardingSurfaceProps {
  return {
    isMaximized: false,
    onMinimize: vi.fn(),
    onToggleMaximize: vi.fn(),
    onClose: vi.fn(),
    importBookmarks: vi.fn(),
    detectBrowserProfiles: vi.fn().mockResolvedValue([]),
    importBookmarkProfile: vi.fn(),
    importLogins: vi.fn(),
    completeOnboarding: vi.fn().mockResolvedValue(undefined),
    platform: 'win32',
    telemetryEnabled: false,
    ...overrides,
  };
}

function renderSurface(p: OnboardingSurfaceProps = props()) {
  render(
    <I18nProvider locale="en">
      <OnboardingSurface {...p} />
    </I18nProvider>,
  );
}

describe('OnboardingSurface', () => {
  it('walks through the setup steps', () => {
    renderSurface();

    expect(screen.getByRole('heading', { name: 'Welcome' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Begin' }));
    expect(screen.getByRole('heading', { name: 'Session' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Sign in with Tepegöz Account' })).toHaveProperty(
      'disabled',
      true,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.getByRole('heading', { name: 'Privacy' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.getByRole('heading', { name: 'Import' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Choose bookmarks file/ })).toBeTruthy();
  });

  it('calls completeOnboarding from the final step', async () => {
    const completeOnboarding = vi.fn().mockResolvedValue(undefined);
    renderSurface(props({ completeOnboarding }));

    fireEvent.click(screen.getByRole('button', { name: 'Begin' }));
    fireEvent.click(screen.getByRole('button', { name: 'Continue' })); // account -> privacy
    fireEvent.click(screen.getByRole('button', { name: 'Continue' })); // privacy -> import
    fireEvent.click(screen.getByRole('button', { name: 'Skip import' }));
    fireEvent.click(screen.getByRole('button', { name: 'Start browsing' }));

    await waitFor(() => expect(completeOnboarding).toHaveBeenCalledTimes(1));
  });
});

describe('PrivacyStep', () => {
  function goToPrivacy(): void {
    fireEvent.click(screen.getByRole('button', { name: 'Begin' }));
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
  }

  it('states telemetry is off by default when the real preference is off', () => {
    renderSurface(props({ telemetryEnabled: false }));
    goToPrivacy();
    expect(screen.getByText('Off')).toBeTruthy();
    expect(screen.queryByText('On')).toBeNull();
  });

  it('reflects the real preference rather than hardcoding "off" when telemetry is on', () => {
    // If this step ever hardcoded "off" instead of reading the injected preference, a profile where
    // telemetry was actually turned on would show a false-safe label — the one privacy claim this
    // step cannot afford to get wrong.
    renderSurface(props({ telemetryEnabled: true }));
    goToPrivacy();
    expect(screen.getByText('On')).toBeTruthy();
    expect(screen.queryByText('Off')).toBeNull();
  });

  it('explains the sensitive-site lockout by category, not a promise of general safety', () => {
    renderSurface(props());
    goToPrivacy();
    expect(
      screen.getByRole('heading', { name: 'Sensitive sites get extra protection' }),
    ).toBeTruthy();
    expect(screen.getByText('Banking')).toBeTruthy();
    expect(screen.getByText('Government')).toBeTruthy();
    expect(screen.getByText('Crypto')).toBeTruthy();
    expect(screen.getByText('Password managers')).toBeTruthy();
    expect(screen.getByText('Healthcare')).toBeTruthy();
  });

  it('can be reached and left with the keyboard alone', () => {
    renderSurface(props());
    goToPrivacy();
    const continueButton = screen.getByRole('button', { name: 'Continue' });
    continueButton.focus();
    expect(document.activeElement).toBe(continueButton);
    fireEvent.click(continueButton);
    expect(screen.getByRole('heading', { name: 'Import' })).toBeTruthy();
  });
});

const CHROME_PROFILE = {
  id: 'chrome:abc123',
  source: 'chrome' as const,
  browserLabel: 'Chrome',
  profileName: 'Kuray',
  modifiedAt: 2,
};

function goToImport(): void {
  fireEvent.click(screen.getByRole('button', { name: 'Begin' })); // welcome -> account
  fireEvent.click(screen.getByRole('button', { name: 'Continue' })); // account -> privacy
  fireEvent.click(screen.getByRole('button', { name: 'Continue' })); // privacy -> import
}

describe('importing from a profile on this computer', () => {
  it('does not scan the disk until the import step is opened', () => {
    // A first-run window that read the disk before the user had said they wanted to import anything
    // would be doing it behind their back, which is the opposite of what this browser claims.
    const detectBrowserProfiles = vi.fn().mockResolvedValue([CHROME_PROFILE]);
    renderSurface(props({ detectBrowserProfiles }));
    expect(detectBrowserProfiles).not.toHaveBeenCalled();

    goToImport();
    expect(detectBrowserProfiles).toHaveBeenCalledTimes(1);
  });

  it('lists what was found and imports the one that is picked', async () => {
    const importBookmarkProfile = vi
      .fn()
      .mockResolvedValue({ imported: 12, skipped: 3, folders: 2, truncated: false, errors: [] });
    renderSurface(
      props({
        detectBrowserProfiles: vi.fn().mockResolvedValue([CHROME_PROFILE]),
        importBookmarkProfile,
      }),
    );
    goToImport();

    await screen.findByText('Chrome');
    expect(screen.getByText('Kuray')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Import from Chrome — Kuray' }));

    await waitFor(() => expect(importBookmarkProfile).toHaveBeenCalledWith('chrome:abc123'));
    await screen.findByText('12 bookmarks imported. 3 skipped.');
  });

  it('says a profile is gone rather than reporting an import of nothing', async () => {
    // The browser can be uninstalled between the list being drawn and the button being pressed. "0
    // imported" and "that profile is no longer there" are different answers; only one is true.
    renderSurface(
      props({
        detectBrowserProfiles: vi.fn().mockResolvedValue([CHROME_PROFILE]),
        importBookmarkProfile: vi.fn().mockResolvedValue({
          imported: 0,
          skipped: 0,
          folders: 0,
          truncated: false,
          errors: ['That profile is no longer available.'],
        }),
      }),
    );
    goToImport();
    fireEvent.click(await screen.findByRole('button', { name: 'Import from Chrome — Kuray' }));
    await screen.findByText('That profile is no longer available.');
  });

  it('shows no list at all when nothing is installed', async () => {
    renderSurface(props());
    goToImport();
    await waitFor(() => expect(screen.queryByText('Found on this computer')).toBeNull());
    // The file cards are still the whole feature on a machine with no other browser.
    expect(screen.getByRole('button', { name: /Choose bookmarks file/ })).toBeTruthy();
  });

  it('survives a detection that fails', async () => {
    renderSurface(props({ detectBrowserProfiles: vi.fn().mockRejectedValue(new Error('nope')) }));
    goToImport();
    await waitFor(() => expect(screen.queryByText('Found on this computer')).toBeNull());
    expect(screen.getByRole('heading', { name: 'Import' })).toBeTruthy();
  });
});

describe('accessibility of the onboarding chrome', () => {
  it('gives each step dot a 24px target, not the 8px bar it paints', () => {
    // WCAG 2.2 §2.5.8. An 8px-high control is a coin toss for anyone without fine pointer control;
    // the bar stays 8px and the button around it is 24px.
    render(<I18nProvider locale="en">{<OnboardingSurface {...props()} />}</I18nProvider>);
    const dot = screen
      .getAllByRole('button', { name: /./ })
      .find((b) => b.className.includes('h-6'));
    expect(dot).toBeDefined();
  });

  it('draws no caption controls on macOS', () => {
    render(
      <I18nProvider locale="en">
        {<OnboardingSurface {...props({ platform: 'darwin' })} />}
      </I18nProvider>,
    );
    expect(screen.queryByRole('button', { name: 'Close' })).toBeNull();
  });
});
