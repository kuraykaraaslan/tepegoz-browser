// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { I18nProvider } from '@tepegoz/i18n/react';
import { DEFAULT_PREFERENCES } from '@tepegoz/preferences';
import type { Preferences } from '@tepegoz/desktop-ipc';
import { AccessibilitySection } from './settings-accessibility';

/**
 * Preferences → Accessibility (a `ComingSoonCard` while the product claimed WCAG 2.2 AA). Two real
 * controls: the default page-zoom select writes `defaultPageZoom`, the reduce-motion toggle writes
 * `reduceMotion`, and the "clear per-site zoom" action only appears when there are per-site levels and
 * clears them all through the confirm dialog.
 */

function renderSection(over: Partial<Preferences> = {}) {
  const setPref = vi.fn();
  render(
    <I18nProvider locale="en">
      <AccessibilitySection prefs={{ ...DEFAULT_PREFERENCES, ...over }} setPref={setPref} />
    </I18nProvider>,
  );
  return { setPref };
}

afterEach(cleanup);

describe('AccessibilitySection', () => {
  it('writes the selected default page zoom as a numeric factor', () => {
    const { setPref } = renderSection();
    fireEvent.change(screen.getByLabelText(/zoom/i), { target: { value: '1.5' } });
    expect(setPref).toHaveBeenCalledWith({ defaultPageZoom: 1.5 });
  });

  it('writes reduceMotion when the toggle is flipped', () => {
    const { setPref } = renderSection();
    fireEvent.click(screen.getByRole('switch', { name: /motion/i }));
    expect(setPref).toHaveBeenCalledWith({ reduceMotion: true });
  });

  it('hides the per-site clear action when there are no per-site zoom levels', () => {
    renderSection({ siteZoomFactors: {} });
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('clears every per-site zoom level through the confirm dialog', () => {
    const { setPref } = renderSection({ siteZoomFactors: { 'example.com': 1.5, 'a.test': 2 } });
    fireEvent.click(screen.getByRole('button', { name: /reset every site/i }));
    // confirm dialog's destructive button
    const buttons = screen.getAllByRole('button');
    fireEvent.click(buttons[buttons.length - 1]!);
    expect(setPref).toHaveBeenCalledWith({ siteZoomFactors: {} });
  });

  it('lists each site with its zoom, sorted, and resets just the one clicked', () => {
    const { setPref } = renderSection({
      siteZoomFactors: { 'https://b.test': 2, 'https://a.test': 1.5, 'https://c.test': 0.5 },
    });
    const rows = within(screen.getByRole('list', { name: /own zoom/i })).getAllByRole('listitem');
    expect(rows.map((r) => r.textContent)).toEqual([
      expect.stringContaining('https://a.test'),
      expect.stringContaining('https://b.test'),
      expect.stringContaining('https://c.test'),
    ]);
    expect(rows[0]!.textContent).toContain('150%');
    expect(rows[2]!.textContent).toContain('50%');
    fireEvent.click(screen.getByRole('button', { name: /reset zoom for https:\/\/b\.test/i }));
    expect(setPref).toHaveBeenCalledWith({
      siteZoomFactors: { 'https://a.test': 1.5, 'https://c.test': 0.5 },
    });
  });

  it('shows no per-site list when no site has its own zoom', () => {
    renderSection({ siteZoomFactors: {} });
    expect(screen.queryByRole('list', { name: /own zoom/i })).toBeNull();
  });
});
