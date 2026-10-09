// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { I18nProvider } from '@tepegoz/i18n/react';
import { DEFAULT_PREFERENCES } from '@tepegoz/preferences';
import type { Preferences } from '@tepegoz/desktop-ipc';
import { StartupSection } from './settings-startup';

/**
 * Preferences → On startup. Three real preferences that used to hide under "System tray & power".
 * Under test: the launch-at-login toggle and the startup-mode radios write their preference; the
 * kiosk URL field appears only in kiosk mode; and an un-navigable kiosk URL is shown as an error and
 * never committed (the schema would reject it anyway).
 */

function renderSection(over: Partial<Preferences> = {}) {
  const setPref = vi.fn();
  render(
    <I18nProvider locale="en">
      <StartupSection prefs={{ ...DEFAULT_PREFERENCES, ...over }} setPref={setPref} />
    </I18nProvider>,
  );
  return { setPref };
}

afterEach(cleanup);

describe('StartupSection', () => {
  it('writes launchAtLogin when the toggle is flipped', () => {
    const { setPref } = renderSection();
    fireEvent.click(screen.getByRole('switch', { name: /launch/i }));
    expect(setPref).toHaveBeenCalledWith({ launchAtLogin: true });
  });

  it('writes the chosen startup mode', () => {
    const { setPref } = renderSection();
    const modes = document.querySelectorAll<HTMLInputElement>('input[name="startup-mode"]');
    fireEvent.click(modes[modes.length - 1]!); // kiosk is the last option
    expect(setPref).toHaveBeenCalledWith({ startupMode: 'kiosk' });
  });

  it('shows the pages box only in "specific pages" mode, and commits normalized addresses', () => {
    const { setPref } = renderSection();
    expect(document.getElementById('startup-pages')).toBeNull();
    cleanup();
    const second = renderSection({ startupTabs: 'pages', startupPages: [] });
    const box = document.getElementById('startup-pages') as HTMLTextAreaElement;
    expect(box).not.toBeNull();
    fireEvent.change(box, { target: { value: 'example.com\n\n  https://b.example/x  \n' } });
    fireEvent.blur(box);
    expect(second.setPref).toHaveBeenCalledWith({
      startupPages: ['https://example.com', 'https://b.example/x'],
    });
    expect(setPref).not.toHaveBeenCalled();
  });

  it('flags a bad line, stores nothing, and refuses more than ten pages', () => {
    const { setPref } = renderSection({ startupTabs: 'pages', startupPages: [] });
    const box = document.getElementById('startup-pages') as HTMLTextAreaElement;
    fireEvent.change(box, { target: { value: 'https://ok.example/\njavascript:alert(1)' } });
    fireEvent.blur(box);
    expect(box.getAttribute('aria-invalid')).toBe('true');
    expect(setPref).not.toHaveBeenCalled();
    const eleven = Array.from({ length: 11 }, (_, i) => `https://p${String(i)}.example/`).join(
      '\n',
    );
    fireEvent.change(box, { target: { value: eleven } });
    fireEvent.blur(box);
    expect(setPref).not.toHaveBeenCalled();
  });

  it('offers the pages mode as the third startup-tabs option', () => {
    const { setPref } = renderSection();
    const tabs = document.querySelectorAll<HTMLInputElement>('input[name="startup-tabs"]');
    expect(tabs).toHaveLength(3);
    fireEvent.click(tabs[2]!);
    expect(setPref).toHaveBeenCalledWith({ startupTabs: 'pages' });
  });

  it('writes which tabs a normal launch opens, and shows the choice only outside kiosk mode', () => {
    const { setPref } = renderSection();
    const tabs = document.querySelectorAll<HTMLInputElement>('input[name="startup-tabs"]');
    expect(tabs).toHaveLength(3);
    expect(tabs[0]!.checked).toBe(true); // restore is the default
    fireEvent.click(tabs[1]!);
    expect(setPref).toHaveBeenCalledWith({ startupTabs: 'newtab' });
    cleanup();
    renderSection({ startupMode: 'kiosk' });
    expect(document.querySelectorAll('input[name="startup-tabs"]')).toHaveLength(0);
  });

  it('shows the kiosk URL field only in kiosk mode', () => {
    renderSection({ startupMode: 'window' });
    expect(screen.queryByLabelText(/kiosk url/i)).toBeNull();
    cleanup();
    renderSection({ startupMode: 'kiosk' });
    expect(screen.getByLabelText(/kiosk url/i)).toBeTruthy();
  });

  it('commits a valid kiosk URL on blur', () => {
    const { setPref } = renderSection({ startupMode: 'kiosk' });
    const field = screen.getByLabelText(/kiosk url/i);
    fireEvent.change(field, { target: { value: 'https://example.com' } });
    fireEvent.blur(field);
    expect(setPref).toHaveBeenCalledWith({ kioskUrl: 'https://example.com' });
  });

  it('does not commit an un-navigable kiosk URL', () => {
    const { setPref } = renderSection({ startupMode: 'kiosk' });
    const field = screen.getByLabelText(/kiosk url/i);
    fireEvent.change(field, { target: { value: 'not a url' } });
    fireEvent.blur(field);
    // The kiosk field is the only control touched here, so any setPref call would be the bad one.
    expect(setPref).not.toHaveBeenCalled();
  });
});
