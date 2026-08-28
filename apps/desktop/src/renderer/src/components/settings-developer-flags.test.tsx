// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { I18nProvider } from '@tepegoz/i18n/react';
import { DEFAULT_PREFERENCES } from '@tepegoz/preferences';
import { CHROMIUM_FLAG_ALLOWLIST } from '@tepegoz/shared-types';
import type { Preferences } from '@tepegoz/desktop-ipc';
import { ChromiumFlagsCard } from './settings-developer-flags';

function renderCard(over: Partial<Preferences> = {}, locale: 'en' | 'tr' = 'en') {
  const onUpdatePrefs = vi.fn(() => Promise.resolve());
  const ui = (o: Partial<Preferences>) => (
    <I18nProvider locale={locale}>
      <ChromiumFlagsCard prefs={{ ...DEFAULT_PREFERENCES, ...o }} onUpdatePrefs={onUpdatePrefs} />
    </I18nProvider>
  );
  const view = render(ui(over));
  return { onUpdatePrefs, rerenderWith: (o: Partial<Preferences>) => view.rerender(ui(o)) };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('ChromiumFlagsCard', () => {
  it('renders a switch and a non-empty label for every allowlisted flag', () => {
    renderCard();
    const switches = screen.getAllByRole('switch');
    expect(switches).toHaveLength(CHROMIUM_FLAG_ALLOWLIST.length);
    for (const f of CHROMIUM_FLAG_ALLOWLIST) {
      // the raw id is shown as a <code> chip, and the localized name as the toggle label
      expect(screen.getByText(f.id)).toBeTruthy();
      const toggle = screen.getByTestId(`toggle-chromium-flag-${f.id}`);
      expect(toggle).toBeTruthy();
    }
  });

  it('reflects the persisted on/off state', () => {
    renderCard({ chromiumFlags: { 'disable-gpu': true } });
    const on = screen.getByTestId<HTMLInputElement>('toggle-chromium-flag-disable-gpu');
    const off = screen.getByTestId<HTMLInputElement>('toggle-chromium-flag-force-dark-mode');
    expect(on.checked).toBe(true);
    expect(off.checked).toBe(false);
  });

  it('merges the new value into chromiumFlags rather than replacing the object', () => {
    const { onUpdatePrefs } = renderCard({ chromiumFlags: { 'disable-gpu': true } });
    fireEvent.click(screen.getByTestId('toggle-chromium-flag-force-dark-mode'));
    expect(onUpdatePrefs).toHaveBeenCalledWith({
      chromiumFlags: { 'disable-gpu': true, 'force-dark-mode': true },
    });
  });

  it('shows the relaunch hint only once the selection diverges from the booted one', () => {
    const { rerenderWith } = renderCard({ chromiumFlags: {} }, 'en');
    expect(screen.queryByText(/Relaunch Tepegöz/)).toBeNull();
    // the parent persists the change and feeds the new prefs back down
    rerenderWith({ chromiumFlags: { 'show-fps-counter': true } });
    expect(screen.getByText(/Relaunch Tepegöz/)).toBeTruthy();
  });

  it('marks experimental flags with a badge', () => {
    renderCard();
    // at least one allowlisted flag is experimental; the badge text comes from the dict
    const experimental = CHROMIUM_FLAG_ALLOWLIST.filter((f) => f.experimental);
    expect(experimental.length).toBeGreaterThan(0);
    expect(screen.getAllByText('Experimental').length).toBe(experimental.length);
  });
});
