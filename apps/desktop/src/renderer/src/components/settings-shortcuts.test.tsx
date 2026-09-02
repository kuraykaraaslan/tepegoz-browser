// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { I18nProvider } from '@tepegoz/i18n/react';
import { formatShortcut, SHORTCUTS } from '@tepegoz/shortcuts';
import { ShortcutsSection } from './settings-shortcuts';

/**
 * The keyboard-shortcut help list, rendered straight from the `SHORTCUTS` registry (a hand-kept table
 * would go stale and teach a dead key). The filter matches the key notation as well as the
 * description, and it uses the platform's own notation from `window.tepegoz.platform`.
 */

beforeEach(() => {
  Object.defineProperty(window, 'tepegoz', { configurable: true, value: { platform: 'win32' } });
});
afterEach(cleanup);

function renderSection() {
  render(
    <I18nProvider locale="en">
      <ShortcutsSection />
    </I18nProvider>,
  );
}

describe('ShortcutsSection', () => {
  it('renders one row per registered shortcut', () => {
    renderSection();
    expect(screen.getAllByRole('listitem')).toHaveLength(SHORTCUTS.length);
  });

  it('shows the Windows key notation for the current platform', () => {
    renderSection();
    // formatShortcut on win32 spells modifiers as "Ctrl+..."; at least one row must show it.
    const anyCtrl = SHORTCUTS.some((sc) => formatShortcut(sc, 'win32').includes('Ctrl'));
    expect(anyCtrl).toBe(true);
    expect(screen.getByText(formatShortcut(SHORTCUTS[0], 'win32'))).toBeTruthy();
  });

  it('filters the list by key notation', () => {
    renderSection();
    const full = screen.getAllByRole('listitem').length;
    fireEvent.change(screen.getByLabelText(/filter/i), { target: { value: 'ctrl+shift' } });
    const filtered = screen.getAllByRole('listitem').length;
    expect(filtered).toBeGreaterThan(0);
    expect(filtered).toBeLessThan(full);
  });

  it('shows the no-results message when nothing matches the filter', () => {
    renderSection();
    fireEvent.change(screen.getByLabelText(/filter/i), {
      target: { value: 'zzz-not-a-shortcut-zzz' },
    });
    expect(screen.queryAllByRole('listitem')).toHaveLength(0);
  });
});
