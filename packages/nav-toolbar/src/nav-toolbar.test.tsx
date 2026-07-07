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
