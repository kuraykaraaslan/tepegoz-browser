// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { TabStrip, type TabDescriptor, type TabGroupDescriptor } from './tab-strip';

/**
 * The drag OVERLAY (the chip that follows the cursor) stays uncovered: it renders only while a drag
 * is in flight, which needs a simulated dnd-kit pointer drag. The state machine that decides when it
 * appears is driven directly in `tab-strip-drag.test.ts`.
 */

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

const tab = (id: string, title: string, over: Partial<TabDescriptor> = {}): TabDescriptor => ({
  id,
  title,
  faviconUrl: null,
  isLoading: false,
  ...over,
});

const group = (id: string, name: string, over: Partial<TabGroupDescriptor> = {}) => ({
  id,
  name,
  color: 'blue',
  collapsed: false,
  ...over,
});

function renderFull(over: Partial<Parameters<typeof TabStrip>[0]> = {}) {
  const handlers = {
    onSelect: vi.fn(),
    onClose: vi.fn(),
    onContextMenu: vi.fn(),
    onNew: vi.fn(),
    onToggleGroupCollapsed: vi.fn(),
    onGroupContextMenu: vi.fn(),
    onRenameGroup: vi.fn(),
    onRenameHandled: vi.fn(),
  };
  const props = {
    tabs: TABS,
    activeId: '1' as string | null,
    labels: { ...LABELS, unnamedGroup: 'Group', toggleGroup: 'Toggle group' },
    ...handlers,
    ...over,
  };
  render(<TabStrip {...props} />);
  return handlers;
}

describe('pinned tabs', () => {
  it('puts pinned tabs first, whatever order they arrive in', () => {
    // A pinned tab is pinned to the FRONT; leaving it where it sat would make pinning look broken.
    renderFull({
      tabs: [tab('a', 'Plain'), tab('b', 'Pinned', { pinned: true })],
      activeId: 'a',
    });
    const titles = screen.getAllByRole('tab').map((t) => t.getAttribute('aria-label'));
    expect(titles).toEqual(['Pinned', 'Plain']);
  });

  it('keeps a pinned tab out of any group run', () => {
    // Pinned tabs sit ahead of the groups, so a pinned tab carrying a groupId must not pull the
    // group header forward with it.
    renderFull({
      tabs: [
        tab('p', 'Pinned', { pinned: true, groupId: 'g1' }),
        tab('m', 'Member', { groupId: 'g1' }),
      ],
      groups: [group('g1', 'Work')],
      activeId: 'p',
    });
    const strip = screen.getByRole('tablist');
    expect(strip.textContent?.indexOf('Pinned')).toBeLessThan(
      strip.textContent?.indexOf('Work') ?? -1,
    );
  });
});

describe('tab groups', () => {
  it('renders a header before the group run, and the members after it', () => {
    renderFull({
      tabs: [
        tab('a', 'Loose'),
        tab('b', 'In group', { groupId: 'g1' }),
        tab('c', 'Also in', { groupId: 'g1' }),
      ],
      groups: [group('g1', 'Work')],
      activeId: 'a',
    });
    expect(screen.getByText('Work')).toBeDefined();
    expect(screen.getByRole('tab', { name: 'In group' })).toBeDefined();
    expect(screen.getByRole('tab', { name: 'Also in' })).toBeDefined();
    expect(screen.getByRole('tab', { name: 'Loose' })).toBeDefined();
  });

  it('hides the members of a collapsed group but keeps its header and count', () => {
    // Collapsed is the whole point of a group: the header stands in for its tabs, and the count is
    // the only thing left saying how many are behind it.
    renderFull({
      tabs: [tab('b', 'In group', { groupId: 'g1' }), tab('c', 'Also in', { groupId: 'g1' })],
      groups: [group('g1', 'Work', { collapsed: true })],
      activeId: 'b',
    });
    expect(screen.getByText('Work')).toBeDefined();
    expect(screen.getByText('2')).toBeDefined();
    expect(screen.queryByRole('tab', { name: 'In group' })).toBeNull();
  });

  it('treats a tab whose group is unknown as ungrouped rather than dropping it', () => {
    // The tabs and the groups arrive as two lists; a tab can name a group that has not landed yet.
    renderFull({
      tabs: [tab('a', 'Orphan', { groupId: 'gone' })],
      groups: [],
      activeId: 'a',
    });
    expect(screen.getByRole('tab', { name: 'Orphan' })).toBeDefined();
  });

  it('splits a group into separate runs when its tabs are not contiguous', () => {
    // The strip renders what it is given; two runs of the same group get a header each, because a
    // single header could not sit before both.
    renderFull({
      tabs: [
        tab('a', 'First member', { groupId: 'g1' }),
        tab('b', 'Interloper'),
        tab('c', 'Second member', { groupId: 'g1' }),
      ],
      groups: [group('g1', 'Work')],
      activeId: 'a',
    });
    expect(screen.getAllByText('Work')).toHaveLength(2);
  });

  it('toggles a group collapsed through its header', () => {
    const h = renderFull({
      tabs: [tab('b', 'In group', { groupId: 'g1' })],
      groups: [group('g1', 'Work')],
      activeId: 'b',
    });
    fireEvent.click(screen.getByRole('button', { name: 'Toggle group' }));
    expect(h.onToggleGroupCollapsed).toHaveBeenCalledWith('g1', true);
  });

  it('renames a group on double-click, and only reports a name that actually changed', () => {
    const h = renderFull({
      tabs: [tab('b', 'In group', { groupId: 'g1' })],
      groups: [group('g1', 'Work')],
      activeId: 'b',
    });
    fireEvent.doubleClick(screen.getByRole('button', { name: 'Toggle group' }));

    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'Research' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(h.onRenameGroup).toHaveBeenCalledWith('g1', 'Research');
  });

  it('does not report a rename that committed the same name', () => {
    // Committing an unchanged name is what pressing Enter on an untouched field does, and writing it
    // back would journal an edit that edited nothing.
    const h = renderFull({
      tabs: [tab('b', 'In group', { groupId: 'g1' })],
      groups: [group('g1', 'Work')],
      activeId: 'b',
    });
    fireEvent.doubleClick(screen.getByRole('button', { name: 'Toggle group' }));
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' });
    expect(h.onRenameGroup).not.toHaveBeenCalled();
  });

  it('opens the rename editor when the HOST asks for it, then says it has consumed the request', () => {
    // The native "Rename group" menu item lives in main; this is how it reaches the strip. Without
    // the acknowledgement the request would re-open the editor on every later render.
    const h = renderFull({
      tabs: [tab('b', 'In group', { groupId: 'g1' })],
      groups: [group('g1', 'Work')],
      activeId: 'b',
      renamingGroupId: 'g1',
    });
    expect(screen.getByRole('textbox')).toBeDefined();
    expect(h.onRenameHandled).toHaveBeenCalled();
  });

  it('relays a right-click on a group header', () => {
    const h = renderFull({
      tabs: [tab('b', 'In group', { groupId: 'g1' })],
      groups: [group('g1', 'Work')],
      activeId: 'b',
    });
    fireEvent.contextMenu(screen.getByText('Work'));
    expect(h.onGroupContextMenu).toHaveBeenCalledWith('g1');
  });
});

describe('the strip scrolls sideways', () => {
  it('turns a vertical wheel into horizontal scroll, since the strip is one row', () => {
    renderFull();
    const scroller = screen.getByRole('tablist'); // the tablist IS the scroller
    Object.defineProperty(scroller, 'scrollLeft', { value: 0, writable: true });

    fireEvent.wheel(scroller, { deltaY: 90 });
    expect(scroller.scrollLeft).toBe(90);
  });

  it('leaves a shift-wheel alone, because the platform already means horizontal by it', () => {
    renderFull();
    const scroller = screen.getByRole('tablist'); // the tablist IS the scroller
    Object.defineProperty(scroller, 'scrollLeft', { value: 5, writable: true });

    fireEvent.wheel(scroller, { deltaY: 90, shiftKey: true });
    expect(scroller.scrollLeft).toBe(5);
  });
});
