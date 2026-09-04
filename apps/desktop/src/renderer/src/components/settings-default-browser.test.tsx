// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { I18nProvider } from '@tepegoz/i18n/react';
import { DefaultBrowserSection } from './settings-default-browser';

/**
 * Default-browser registration (Phase 2b). It is a button, never an auto-toggle. The status the row
 * reports is always the RE-FETCHED fact ("is Tepegöz the default") — never "the button was pressed" —
 * and it is re-read on window focus so walking to the OS settings and back does not leave a stale row.
 */

const getDefaultBrowserStatus = vi.fn();
const setAsDefaultBrowser = vi.fn();

beforeEach(() => {
  getDefaultBrowserStatus.mockReset().mockResolvedValue({ isDefault: false });
  setAsDefaultBrowser.mockReset().mockResolvedValue({ isDefault: true });
  Object.defineProperty(window, 'tepegoz', {
    configurable: true,
    value: { getDefaultBrowserStatus, setAsDefaultBrowser },
  });
});
afterEach(cleanup);

function renderSection() {
  render(
    <I18nProvider locale="en">
      <DefaultBrowserSection />
    </I18nProvider>,
  );
}

describe('DefaultBrowserSection', () => {
  it('checks the status on mount and offers the button only when not default', async () => {
    renderSection();
    await waitFor(() => expect(getDefaultBrowserStatus).toHaveBeenCalled());
    expect(screen.getByRole('button', { name: /make.*default/i })).toBeTruthy();
  });

  it('hides the make-default button once Tepegöz is the default', async () => {
    getDefaultBrowserStatus.mockResolvedValue({ isDefault: true });
    renderSection();
    await waitFor(() => expect(getDefaultBrowserStatus).toHaveBeenCalled());
    expect(screen.queryByRole('button', { name: /make.*default/i })).toBeNull();
    // the recheck button is still there
    expect(screen.getByRole('button', { name: /check again/i })).toBeTruthy();
  });

  it('re-fetches the status when the make-default attempt resolves', async () => {
    renderSection();
    await waitFor(() => expect(screen.getByRole('button', { name: /make.*default/i })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /make.*default/i }));
    await waitFor(() => expect(setAsDefaultBrowser).toHaveBeenCalledTimes(1));
    // it became default → the offer button is gone
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /make.*default/i })).toBeNull(),
    );
  });

  it('shows the failure line when the OS picker did not make it default', async () => {
    setAsDefaultBrowser.mockResolvedValue({ isDefault: false });
    renderSection();
    await waitFor(() => expect(screen.getByRole('button', { name: /make.*default/i })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /make.*default/i }));
    await waitFor(() => expect(screen.getByText(/could not register/i)).toBeTruthy());
  });

  it('treats a rejected status check as "not default"', async () => {
    getDefaultBrowserStatus.mockRejectedValue(new Error('shell query failed'));
    renderSection();
    await waitFor(() => expect(screen.getByRole('button', { name: /make.*default/i })).toBeTruthy());
  });

  it('shows the failure line when the make-default call rejects outright', async () => {
    setAsDefaultBrowser.mockRejectedValue(new Error('picker crashed'));
    renderSection();
    await waitFor(() => expect(screen.getByRole('button', { name: /make.*default/i })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /make.*default/i }));
    await waitFor(() => expect(screen.getByText(/could not register/i)).toBeTruthy());
  });

  it('re-reads the status when the window regains focus', async () => {
    renderSection();
    await waitFor(() => expect(getDefaultBrowserStatus).toHaveBeenCalledTimes(1));
    act(() => {
      window.dispatchEvent(new Event('focus'));
    });
    await waitFor(() => expect(getDefaultBrowserStatus).toHaveBeenCalledTimes(2));
  });
});
