import type { vi as Vi } from 'vitest';
import type { render as Render } from '@testing-library/react';
import { TabStrip, type TabDescriptor, type TabGroupDescriptor } from './tab-strip';

export const LABELS = {
  tablist: 'Tabs',
  untitled: 'Untitled',
  closeTab: 'Close tab',
  newTab: 'New tab',
};

export const TABS: readonly TabDescriptor[] = [
  { id: '1', title: 'First page', faviconUrl: null, isLoading: false },
  { id: '2', title: 'Second page', faviconUrl: null, isLoading: false },
];

export const tab = (
  id: string,
  title: string,
  over: Partial<TabDescriptor> = {},
): TabDescriptor => ({
  id,
  title,
  faviconUrl: null,
  isLoading: false,
  ...over,
});

export const group = (id: string, name: string, over: Partial<TabGroupDescriptor> = {}) => ({
  id,
  name,
  color: 'blue',
  collapsed: false,
  ...over,
});

/**
 * The helpers that need `vitest` / Testing Library at runtime. Those are devDependencies and this file
 * is not a `*.test.*` file, so it receives them as arguments (type-only imports above) instead of
 * importing them — keeps dependency-cruiser's not-to-dev-dep rule satisfied.
 */
export function createStripRenderers(vi: typeof Vi, render: typeof Render) {
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

  return { renderStrip, renderFull };
}
