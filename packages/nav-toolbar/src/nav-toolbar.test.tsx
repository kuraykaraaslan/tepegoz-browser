// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { OmniboxSuggestion } from '@tepegoz/omnibox';
import { NavToolbar, type NavToolbarProps } from './nav-toolbar';

const LABELS = {
  back: 'Back',
  forward: 'Forward',
  reload: 'Reload',
  home: 'Home',
  bookmarkAdd: 'Add bookmark',
  bookmarkRemove: 'Remove bookmark',
};

function renderToolbar(over: Partial<NavToolbarProps> = {}) {
  const handlers = {
    onBack: vi.fn(),
    onForward: vi.fn(),
    onReload: vi.fn(),
    onHome: vi.fn(),
    onNavigate: vi.fn(),
  };
  render(
    <NavToolbar
      canGoBack={false}
      canGoForward={false}
      labels={LABELS}
      menu={<span data-testid="menu-slot" />}
      currentUrl="https://a.test/"
      omniboxPlaceholder="Search or type a URL"
      {...handlers}
      {...over}
    />,
  );
  return handlers;
}

afterEach(cleanup);

describe('NavToolbar', () => {
  it('disables back/forward per the nav state and fires the injected callbacks', () => {
    const h = renderToolbar({ canGoBack: true });
    const back = screen.getByRole('button', { name: LABELS.back });
    const forward = screen.getByRole('button', { name: LABELS.forward });
    expect(back.hasAttribute('disabled')).toBe(false);
    expect(forward.hasAttribute('disabled')).toBe(true);
    fireEvent.click(back);
    expect(h.onBack).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: LABELS.reload }));
    expect(h.onReload).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: LABELS.home }));
    expect(h.onHome).toHaveBeenCalledTimes(1);
  });

  it('reports a right-click on back/forward so the host can pop the history dropdown', () => {
    const onBackContextMenu = vi.fn();
    const onForwardContextMenu = vi.fn();
    const h = renderToolbar({
      canGoBack: true,
      canGoForward: true,
      onBackContextMenu,
      onForwardContextMenu,
    });
    fireEvent.contextMenu(screen.getByRole('button', { name: LABELS.back }));
    expect(onBackContextMenu).toHaveBeenCalledTimes(1);
    fireEvent.contextMenu(screen.getByRole('button', { name: LABELS.forward }));
    expect(onForwardContextMenu).toHaveBeenCalledTimes(1);
    // Right-click opens the dropdown; it must not ALSO navigate a step.
    expect(h.onBack).not.toHaveBeenCalled();
    expect(h.onForward).not.toHaveBeenCalled();
  });

  it('suppresses the browser default menu so only the host menu shows', () => {
    renderToolbar({ canGoBack: true, onBackContextMenu: vi.fn() });
    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    screen.getByRole('button', { name: LABELS.back }).dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });

  it('hides the bookmark star entirely when no toggle handler is injected', () => {
    renderToolbar();
    expect(screen.queryByRole('button', { name: LABELS.bookmarkAdd })).toBeNull();
  });

  it('reflects bookmark state on the star (label + aria-pressed) and disables it off-web', () => {
    const onToggleBookmark = vi.fn();
    renderToolbar({ onToggleBookmark, canBookmark: true, isBookmarked: true });
    const star = screen.getByRole('button', { name: LABELS.bookmarkRemove });
    expect(star.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(star);
    expect(onToggleBookmark).toHaveBeenCalledTimes(1);
    cleanup();
    renderToolbar({ onToggleBookmark, canBookmark: false, isBookmarked: false });
    const disabledStar = screen.getByRole('button', { name: LABELS.bookmarkAdd });
    expect(disabledStar.hasAttribute('disabled')).toBe(true);
  });

  it('renders the host-supplied menu slot', () => {
    renderToolbar();
    expect(screen.getByTestId('menu-slot')).toBeDefined();
  });

  const ZOOM_LABELS = { indicator: 'Zoom', zoomIn: 'Zoom in', zoomOut: 'Zoom out', reset: 'Reset' };

  it('hides the zoom indicator at 100% and shows it (with the percent) off 100%', () => {
    renderToolbar({ zoomPercent: 100, zoomLabels: ZOOM_LABELS, onZoom: vi.fn() });
    expect(screen.queryByRole('button', { name: /Zoom: / })).toBeNull();
    cleanup();
    renderToolbar({ zoomPercent: 125, zoomLabels: ZOOM_LABELS, onZoom: vi.fn() });
    expect(screen.getByRole('button', { name: 'Zoom: 125%' })).toBeDefined();
  });

  it('opens the bubble and routes −, +, Reset to onZoom', () => {
    const onZoom = vi.fn<(d: 'in' | 'out' | 'reset') => void>();
    renderToolbar({ zoomPercent: 80, zoomLabels: ZOOM_LABELS, onZoom });
    fireEvent.click(screen.getByRole('button', { name: 'Zoom: 80%' }));
    fireEvent.click(screen.getByRole('button', { name: 'Zoom out' }));
    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
    expect(onZoom.mock.calls.map(([d]) => d)).toEqual(['out', 'in', 'reset']);
  });

  it('does not render the indicator when onZoom is not injected', () => {
    renderToolbar({ zoomPercent: 150, zoomLabels: ZOOM_LABELS });
    expect(screen.queryByRole('button', { name: /Zoom/ })).toBeNull();
  });

  it('reports the omnibox suggestion dropdown height for native view layout', async () => {
    vi.useFakeTimers();
    try {
      const suggestions: OmniboxSuggestion[] = [
        {
          key: 'search:duck',
          kind: 'search',
          title: 'duck',
          subtitle: 'Search the web',
          action: { type: 'navigate', input: 'duck' },
        },
      ];
      const onOmniboxDropdownHeightChange = vi.fn<(height: number) => void>();
      const onSuggest = vi.fn<(query: string) => Promise<OmniboxSuggestion[]>>(() =>
        Promise.resolve(suggestions),
      );
      renderToolbar({
        onSuggest,
        onOmniboxDropdownHeightChange,
      });

      const input = screen.getByRole('combobox');
      fireEvent.focus(input);
      fireEvent.change(input, { target: { value: 'duck' } });
      await act(async () => {
        vi.advanceTimersByTime(100);
        await Promise.resolve();
      });

      expect(screen.getByRole('listbox')).toBeDefined();
      const heights = onOmniboxDropdownHeightChange.mock.calls.map(([height]) => height);
      expect(Math.max(...heights)).toBeGreaterThan(0);
    } finally {
      vi.useRealTimers();
    }
  });
});
