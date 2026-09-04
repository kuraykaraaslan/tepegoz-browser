// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { I18nProvider } from '@tepegoz/i18n/react';
import { DEFAULT_PREFERENCES } from '@tepegoz/preferences';
import type { Preferences } from '@tepegoz/desktop-ipc';
import { TraySection } from './settings-tray';

/**
 * Settings → System tray & power. Four independent toggles, plus a tab-discard idle-minutes field
 * that only shows while discarding is on and refuses (rather than silently swallows) a value outside
 * the schema's 1..1440 range.
 */

function renderSection(over: Partial<Preferences> = {}) {
  const setPref = vi.fn();
  render(
    <I18nProvider locale="en">
      <TraySection prefs={{ ...DEFAULT_PREFERENCES, ...over }} setPref={setPref} />
    </I18nProvider>,
  );
  return { setPref };
}

const idleField = () => screen.getByLabelText(/discard after/i);

afterEach(cleanup);

describe('TraySection', () => {
  it('writes each power toggle independently, flipping its current value', () => {
    const { setPref } = renderSection({
      closeToTray: false,
      keepAwakeInTray: false,
      pauseTasksOnSleep: false,
    });
    fireEvent.click(screen.getByRole('switch', { name: /close.*tray/i }));
    fireEvent.click(screen.getByRole('switch', { name: /keep active/i }));
    fireEvent.click(screen.getByRole('switch', { name: /pause on sleep/i }));
    expect(setPref).toHaveBeenCalledWith({ closeToTray: true });
    expect(setPref).toHaveBeenCalledWith({ keepAwakeInTray: true });
    expect(setPref).toHaveBeenCalledWith({ pauseTasksOnSleep: true });
  });

  it('writes the tab-discard toggle, flipping its current value', () => {
    const { setPref } = renderSection({ tabDiscardEnabled: false });
    fireEvent.click(screen.getByRole('switch', { name: /discard/i }));
    expect(setPref).toHaveBeenCalledWith({ tabDiscardEnabled: true });
  });

  it('hides the idle-minutes field until tab discarding is enabled', () => {
    renderSection({ tabDiscardEnabled: false });
    expect(screen.queryByLabelText(/discard after/i)).toBeNull();
    cleanup();
    renderSection({ tabDiscardEnabled: true });
    expect(screen.getByLabelText(/discard after/i)).toBeTruthy();
  });

  it('commits an in-range idle value on blur', () => {
    const { setPref } = renderSection({ tabDiscardEnabled: true });
    fireEvent.change(idleField(), { target: { value: '45' } });
    fireEvent.blur(idleField());
    expect(setPref).toHaveBeenCalledWith({ tabDiscardIdleMinutes: 45 });
  });

  it('rounds a fractional idle value before committing', () => {
    const { setPref } = renderSection({ tabDiscardEnabled: true });
    fireEvent.change(idleField(), { target: { value: '12.7' } });
    fireEvent.blur(idleField());
    expect(setPref).toHaveBeenCalledWith({ tabDiscardIdleMinutes: 13 });
  });

  it('refuses an out-of-range idle value', () => {
    const { setPref } = renderSection({ tabDiscardEnabled: true });
    fireEvent.change(idleField(), { target: { value: '99999' } });
    fireEvent.blur(idleField());
    expect(setPref).not.toHaveBeenCalled();
  });
});
