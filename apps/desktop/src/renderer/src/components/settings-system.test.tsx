// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { I18nProvider } from '@tepegoz/i18n/react';
import { DEFAULT_PREFERENCES } from '@tepegoz/preferences';
import type { Preferences } from '@tepegoz/desktop-ipc';
import { SystemSection } from './settings-system';

/**
 * The System settings section — two before-`whenReady` toggles (hardware acceleration, crash
 * reporting). Both write a preference AND raise the "restart needed" banner, because Chromium /
 * `crash-reporter-boot.ts` read them once at startup and a toggle that claimed an immediate effect
 * would be describing something that had not happened.
 */

afterEach(cleanup);

function renderSection(over: Partial<Preferences> = {}) {
  const setPref = vi.fn();
  render(
    <I18nProvider locale="en">
      <SystemSection prefs={{ ...DEFAULT_PREFERENCES, ...over }} setPref={setPref} />
    </I18nProvider>,
  );
  return { setPref };
}

const crashToggle = (): HTMLInputElement =>
  screen.getByRole<HTMLInputElement>('switch', { name: /crash reports/i });

describe('SystemSection', () => {
  it('reflects the stored crash-reporting preference', () => {
    renderSection({ crashReportingEnabled: true });
    expect(crashToggle().checked).toBe(true);
  });

  it('is off by default', () => {
    renderSection();
    expect(crashToggle().checked).toBe(false);
  });

  it('writes the preference and shows the restart banner when toggled on', () => {
    const { setPref } = renderSection();
    expect(screen.queryByText(/applies after a restart/i)).toBeNull();

    fireEvent.click(crashToggle());

    expect(setPref).toHaveBeenCalledWith({ crashReportingEnabled: true });
    expect(screen.queryByText(/applies after a restart/i)).not.toBeNull();
  });

  it('keeps the hardware-acceleration toggle working alongside it', () => {
    const { setPref } = renderSection();
    fireEvent.click(screen.getByRole('switch', { name: /hardware acceleration/i }));
    expect(setPref).toHaveBeenCalledWith({ hardwareAccelerationEnabled: false });
  });

  it('relaunches the app from the restart banner', () => {
    const relaunchApp = vi.fn();
    Object.defineProperty(window, 'tepegoz', { configurable: true, value: { relaunchApp } });
    renderSection();
    fireEvent.click(crashToggle()); // raises the restart banner
    fireEvent.click(screen.getByRole('button', { name: /restart now/i }));
    expect(relaunchApp).toHaveBeenCalledTimes(1);
  });
});
