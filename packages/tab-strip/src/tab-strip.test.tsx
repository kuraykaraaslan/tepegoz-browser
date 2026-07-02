// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { TabStrip, type TabDescriptor } from './tab-strip';

const LABELS = { tablist: 'Tabs', untitled: 'Untitled', closeTab: 'Close tab', newTab: 'New tab' };

const TABS: readonly TabDescriptor[] = [
  { id: '1', title: 'First page', faviconUrl: null, isLoading: false },
  { id: '2', title: 'Second page', faviconUrl: null, isLoading: false },
];

function renderStrip(tabs: readonly TabDescriptor[] = TABS, activeId: string | null = '1') {
  const handlers = {
    onSelect: vi.fn(),
    onClose: vi.fn(),
    onContextMenu: vi.fn(),
    onNew: vi.fn(),
  };
  render(<TabStrip tabs={tabs} activeId={activeId} labels={LABELS} {...handlers} />);
  return handlers;
}

afterEach(cleanup);

describe('TabStrip', () => {
  it('marks only the active tab as selected in the tablist', () => {
    renderStrip();
    expect(screen.getByRole('tablist', { name: LABELS.tablist })).toBeDefined();
    expect(screen.getByRole('tab', { name: 'First page', selected: true })).toBeDefined();
    expect(screen.getByRole('tab', { name: 'Second page', selected: false })).toBeDefined();
  });

  it('selects on click and on Enter/Space (keyboard)', () => {
    const h = renderStrip();
    fireEvent.click(screen.getByRole('tab', { name: 'Second page' }));
    expect(h.onSelect).toHaveBeenCalledWith('2');
    fireEvent.keyDown(screen.getByRole('tab', { name: 'First page' }), { key: 'Enter' });
    expect(h.onSelect).toHaveBeenCalledWith('1');
  });

  it('closes via the close button (without selecting) and via middle-click', () => {
    const h = renderStrip();
    const [firstClose] = screen.getAllByRole('button', { name: LABELS.closeTab });
    fireEvent.click(firstClose!);
    expect(h.onClose).toHaveBeenCalledWith('1');
    expect(h.onSelect).not.toHaveBeenCalled(); // stopPropagation keeps close from selecting
    fireEvent(
      screen.getByRole('tab', { name: 'Second page' }),
      new MouseEvent('auxclick', { bubbles: true, button: 1 }),
    );
    expect(h.onClose).toHaveBeenCalledWith('2');
  });

  it('opens the context menu callback on right-click', () => {
    const h = renderStrip();
    fireEvent.contextMenu(screen.getByRole('tab', { name: 'First page' }));
    expect(h.onContextMenu).toHaveBeenCalledWith('1');
  });

  it('falls back to the untitled label and fires onNew from the new-tab button', () => {
    const h = renderStrip([{ id: '9', title: '', faviconUrl: null, isLoading: false }], null);
    expect(screen.getByRole('tab', { name: LABELS.untitled })).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: LABELS.newTab }));
    expect(h.onNew).toHaveBeenCalledTimes(1);
  });
});
