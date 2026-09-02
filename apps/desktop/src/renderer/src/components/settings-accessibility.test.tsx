// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
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
    fireEvent.click(screen.getByRole('button'));
    // confirm dialog's destructive button
    const buttons = screen.getAllByRole('button');
    fireEvent.click(buttons[buttons.length - 1]!);
    expect(setPref).toHaveBeenCalledWith({ siteZoomFactors: {} });
  });
});
