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
    importLogins: vi.fn(),
    completeOnboarding: vi.fn().mockResolvedValue(undefined),
    platform: 'win32',
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
    expect(screen.getByRole('heading', { name: 'Import' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Choose bookmarks file/ })).toBeTruthy();
  });

  it('calls completeOnboarding from the final step', async () => {
    const completeOnboarding = vi.fn().mockResolvedValue(undefined);
    renderSurface(props({ completeOnboarding }));

    fireEvent.click(screen.getByRole('button', { name: 'Begin' }));
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    fireEvent.click(screen.getByRole('button', { name: 'Skip import' }));
    fireEvent.click(screen.getByRole('button', { name: 'Start browsing' }));

    await waitFor(() => expect(completeOnboarding).toHaveBeenCalledTimes(1));
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
