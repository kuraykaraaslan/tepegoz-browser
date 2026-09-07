// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core';
import { GROUP_PREFIX } from './drop-resolver';
import { useTabStripDrag, type UseTabStripDragArgs } from './tab-strip-drag';
import type { TabDescriptor, TabGroupDescriptor, TabStripLabels } from './tab-strip-types';

/**
 * The strip's drag-reorder + tear-off state machine, driven directly rather than through dnd-kit.
 *
 * What is worth pinning here is the TEAR: dragging a tab out of the strip hands the whole drag to the
 * host, which flies a preview across the desktop and drops the tab into another window. Once that
 * latches, the in-strip reorder must be discarded entirely — otherwise one gesture both moves the tab
 * within this window AND moves it to another, and the two windows disagree about where it went.
 *
 * One branch stays uncovered: the id guard inside the geometry walk. The query selects
 * [data-tab-id] nodes, so the dataset value it then reads is always a string.
 */

const labels: TabStripLabels = {
  tablist: 'Tabs',
  untitled: 'Untitled',
  closeTab: 'Close',
  newTab: 'New tab',
  unnamedGroup: 'Group',
};

const tab = (over: Partial<TabDescriptor> = {}): TabDescriptor => ({
  id: 't1',
  title: 'Docs',
  faviconUrl: 'https://x/icon.png',
  isLoading: false,
  ...over,
});

const group = (over: Partial<TabGroupDescriptor> = {}): TabGroupDescriptor => ({
  id: 'g1',
  name: 'Work',
  color: 'blue',
  collapsed: false,
  ...over,
});

function args(over: Partial<UseTabStripDragArgs> = {}): UseTabStripDragArgs {
  const tabs = over.tabs ?? [tab()];
  const groups = over.groups ?? [group()];
  return {
    items: ['t1', 't2'],
    tabById: new Map(tabs.map((t) => [t.id, t])),
    groupById: new Map(groups.map((g) => [g.id, g])),
    tabs,
    groups,
    activeId: 't1',
    labels,
    ...over,
  };
}

/** A drag-start carrying an activator point and an initial rect, the way dnd-kit reports one. */
function startEvent(
  id: string,
  opts: {
    clientX?: number;
    clientY?: number;
    rect?: { left: number; top: number; width: number; height: number } | null;
  } = {},
): DragStartEvent {
  const {
    clientX = 100,
    clientY = 40,
    rect = { left: 80, top: 20, width: 161.4, height: 27.2 },
  } = opts;
  return {
    active: {
      id,
      rect: { current: { initial: rect, translated: rect } },
      data: { current: undefined },
    },
    activatorEvent: clientX === -1 ? null : { clientX, clientY },
  } as unknown as DragStartEvent;
}

const endEvent = (activeId: string, overId: string | null): DragEndEvent =>
  ({
    active: { id: activeId },
    over: overId === null ? null : { id: overId },
  }) as unknown as DragEndEvent;

/** Attach a scroller element with a fixed rect, since jsdom measures everything as zero. */
function attachScroller(
  ref: { current: HTMLDivElement | null },
  rect: Partial<DOMRect> = {},
): HTMLDivElement {
  const el = document.createElement('div');
  const full = {
    left: 0,
    top: 0,
    right: 800,
    bottom: 36,
    width: 800,
    height: 36,
    x: 0,
    y: 0,
    ...rect,
  };
  el.getBoundingClientRect = () => ({ ...full, toJSON: () => full });
  document.body.appendChild(el);
  ref.current = el;
  return el;
}

/** Dispatch a window pointermove the way the tear tracker listens for one. */
function pointerMove(point: {
  clientX: number;
  clientY: number;
  screenX: number;
  screenY: number;
}): void {
  act(() => {
    window.dispatchEvent(new MouseEvent('pointermove', point));
  });
}

beforeEach(() => {
  window.innerWidth = 1000;
  window.innerHeight = 800;
});
afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
});

describe('geometry reporting', () => {
  /** Add a tab slot to the scroller with a rect of its own. */
  function addSlot(parent: HTMLElement, id: string, left: number, width: number): void {
    const node = document.createElement('div');
    node.dataset.tabId = id;
    const r = { left, top: 0, right: left + width, bottom: 36, width, height: 36, x: left, y: 0 };
    node.getBoundingClientRect = () => ({ ...r, toJSON: () => r });
    parent.appendChild(node);
  }

  it('reports the strip rect and every tab slot, in client coordinates', () => {
    // Main hit-tests a cross-window drop against these numbers: they are how another window knows a
    // tab was dropped between its third and fourth tab rather than merely somewhere over it.
    const onReportGeometry = vi.fn();
    const { result } = renderHook(() => useTabStripDrag(args({ onReportGeometry })));
    const scroller = attachScroller(result.current.scrollerRef, { left: 12, top: 4 });
    addSlot(scroller, 't1', 12, 160);
    addSlot(scroller, 't2', 172, 160);

    act(() => {
      window.dispatchEvent(new Event('resize'));
    });

    expect(onReportGeometry).toHaveBeenLastCalledWith({
      strip: { x: 12, y: 4, width: 800, height: 36 },
      slots: [
        { id: 't1', left: 12, width: 160 },
        { id: 't2', left: 172, width: 160 },
      ],
    });
  });

  it('reports nothing when the host does not ask for geometry', () => {
    const { result } = renderHook(() => useTabStripDrag(args()));
    const scroller = attachScroller(result.current.scrollerRef);
    addSlot(scroller, 't1', 0, 160);
    act(() => {
      window.dispatchEvent(new Event('resize'));
    });
    // nothing to assert but the absence of a throw: with no handler the measure must not run at all
    expect(result.current.dragId).toBeNull();
  });

  it('stops reporting once the strip unmounts', () => {
    const onReportGeometry = vi.fn();
    const { result, unmount } = renderHook(() => useTabStripDrag(args({ onReportGeometry })));
    attachScroller(result.current.scrollerRef);
    unmount();
    onReportGeometry.mockClear();

    act(() => {
      window.dispatchEvent(new Event('resize'));
    });
    expect(onReportGeometry).not.toHaveBeenCalled();
  });
});

describe('drag start captures the preview seed', () => {
  it('seeds a tab drag from the tab it grabbed, anchored where the pointer took hold', () => {
    const onTearBegin = vi.fn();
    const t = tab({ id: 't1', title: 'Docs', pinned: true, groupId: 'g1' });
    const { result } = renderHook(() =>
      useTabStripDrag(
        args({ tabs: [t], groups: [group({ id: 'g1', color: 'red' })], onTearBegin }),
      ),
    );
    attachScroller(result.current.scrollerRef);

    act(() => result.current.onDragStart(startEvent('t1')));
    pointerMove({ clientX: 100, clientY: 500, screenX: 300, screenY: 700 });

    expect(onTearBegin).toHaveBeenCalledTimes(1);
    expect(onTearBegin.mock.calls[0]?.[0]).toMatchObject({
      item: { kind: 'tab', id: 't1' },
      title: 'Docs',
      faviconUrl: 'https://x/icon.png',
      active: true,
      pinned: true,
      groupColor: 'red',
      // the grab point within the chip, not a fixed corner — the preview stays held where it was taken
      grabOffset: { x: 20, y: 20 },
      // ceil, so a fractional measurement never renders a half-pixel preview
      width: 162,
      height: 28,
    });
  });

  it('falls back to the untitled label and a default anchor when there is nothing to measure', () => {
    const onTearBegin = vi.fn();
    const t = tab({ id: 't1', title: '', faviconUrl: null });
    const { result } = renderHook(() =>
      useTabStripDrag(args({ tabs: [t], activeId: 'other', onTearBegin })),
    );
    attachScroller(result.current.scrollerRef);

    act(() => result.current.onDragStart(startEvent('t1', { clientX: -1, rect: null })));
    pointerMove({ clientX: 100, clientY: 500, screenX: 0, screenY: 0 });

    expect(onTearBegin.mock.calls[0]?.[0]).toMatchObject({
      title: 'Untitled',
      faviconUrl: null,
      active: false,
      pinned: false,
      groupColor: null,
      grabOffset: { x: 16, y: 18 },
      width: 160,
      height: 28,
    });
  });

  it('seeds a group drag, and calls the group active when the active tab lives in it', () => {
    const onTearBegin = vi.fn();
    const tabs = [tab({ id: 't1', groupId: 'g1' })];
    const { result } = renderHook(() =>
      useTabStripDrag(
        args({ tabs, groups: [group({ id: 'g1', name: 'Work', color: 'blue' })], onTearBegin }),
      ),
    );
    attachScroller(result.current.scrollerRef);

    act(() => result.current.onDragStart(startEvent(`${GROUP_PREFIX}g1`)));
    pointerMove({ clientX: 100, clientY: 500, screenX: 0, screenY: 0 });

    expect(onTearBegin.mock.calls[0]?.[0]).toMatchObject({
      item: { kind: 'group', id: 'g1' },
      title: 'Work',
      active: true,
      pinned: false,
      groupColor: 'blue',
    });
  });

  it('names an unnamed group by the label rather than tearing out a blank chip', () => {
    const onTearBegin = vi.fn();
    const { result } = renderHook(() =>
      useTabStripDrag(
        args({ tabs: [], groups: [group({ id: 'g1', name: '   ' })], activeId: null, onTearBegin }),
      ),
    );
    attachScroller(result.current.scrollerRef);

    act(() => result.current.onDragStart(startEvent(`${GROUP_PREFIX}g1`)));
    pointerMove({ clientX: 100, clientY: 500, screenX: 0, screenY: 0 });

    expect(onTearBegin.mock.calls[0]?.[0]).toMatchObject({ title: 'Group', active: false });
  });
});

describe('the tear latch', () => {
  it('does not tear while the pointer stays over the strip', () => {
    const onTearBegin = vi.fn();
    const onTearMove = vi.fn();
    const { result } = renderHook(() => useTabStripDrag(args({ onTearBegin, onTearMove })));
    attachScroller(result.current.scrollerRef);

    act(() => result.current.onDragStart(startEvent('t1')));
    pointerMove({ clientX: 200, clientY: 20, screenX: 200, screenY: 20 });

    expect(onTearBegin).not.toHaveBeenCalled();
    expect(onTearMove).not.toHaveBeenCalled();
    expect(result.current.torn).toBe(false);
  });

  it('needs the pointer to clear the strip by the threshold, not merely leave it', () => {
    // A drag that dips a few pixels below the tabs is still a reorder. Tearing there would fling a
    // tab into a new window on a wobble.
    const onTearBegin = vi.fn();
    const { result } = renderHook(() => useTabStripDrag(args({ onTearBegin })));
    attachScroller(result.current.scrollerRef); // bottom = 36

    act(() => result.current.onDragStart(startEvent('t1')));
    pointerMove({ clientX: 200, clientY: 70, screenX: 0, screenY: 0 }); // 34px below: not yet
    expect(onTearBegin).not.toHaveBeenCalled();

    pointerMove({ clientX: 200, clientY: 100, screenX: 0, screenY: 0 }); // 64px below: torn
    expect(onTearBegin).toHaveBeenCalledTimes(1);
  });

  it('tears when the pointer leaves the WINDOW even at the strip’s own height', () => {
    // Dragging sideways off the screen edge is how a tab moves to a window on another monitor.
    const onTearBegin = vi.fn();
    const { result } = renderHook(() => useTabStripDrag(args({ onTearBegin })));
    attachScroller(result.current.scrollerRef);

    act(() => result.current.onDragStart(startEvent('t1')));
    pointerMove({ clientX: 1200, clientY: 20, screenX: 0, screenY: 0 });
    expect(onTearBegin).toHaveBeenCalledTimes(1);
  });

  it('latches: once torn it keeps streaming, and never begins twice, even back over the strip', () => {
    const onTearBegin = vi.fn();
    const onTearMove = vi.fn();
    const { result } = renderHook(() => useTabStripDrag(args({ onTearBegin, onTearMove })));
    attachScroller(result.current.scrollerRef);

    act(() => result.current.onDragStart(startEvent('t1')));
    pointerMove({ clientX: 200, clientY: 500, screenX: 10, screenY: 20 });
    pointerMove({ clientX: 200, clientY: 600, screenX: 11, screenY: 21 });
    pointerMove({ clientX: 200, clientY: 10, screenX: 12, screenY: 22 }); // back inside the strip

    expect(onTearBegin).toHaveBeenCalledTimes(1);
    expect(onTearMove).toHaveBeenCalledTimes(3);
    expect(onTearMove).toHaveBeenLastCalledWith({ screenX: 12, screenY: 22 });
    expect(result.current.torn).toBe(true);
  });

  it('tracks no pointer at all when no drag is running', () => {
    const onTearMove = vi.fn();
    const { result } = renderHook(() => useTabStripDrag(args({ onTearMove })));
    attachScroller(result.current.scrollerRef);
    pointerMove({ clientX: 200, clientY: 500, screenX: 0, screenY: 0 });
    expect(onTearMove).not.toHaveBeenCalled();
  });
});

describe('drag end', () => {
  it('hands a torn drop to the host and performs NO in-strip reorder', () => {
    const onTearEnd = vi.fn();
    const onMove = vi.fn();
    const { result } = renderHook(() => useTabStripDrag(args({ onTearEnd, onMove })));
    attachScroller(result.current.scrollerRef);

    act(() => result.current.onDragStart(startEvent('t1')));
    pointerMove({ clientX: 200, clientY: 500, screenX: 55, screenY: 66 });
    act(() => result.current.onDragEnd(endEvent('t1', 't2')));

    expect(onTearEnd).toHaveBeenCalledWith({ screenX: 55, screenY: 66 });
    expect(onMove).not.toHaveBeenCalled();
    expect(result.current.torn).toBe(false);
    expect(result.current.dragId).toBeNull();
  });

  it('reorders in place when the drop was never torn', () => {
    const onMove = vi.fn();
    const onTearEnd = vi.fn();
    const { result } = renderHook(() =>
      useTabStripDrag(
        args({
          items: ['t1', 't2'],
          tabs: [tab({ id: 't1' }), tab({ id: 't2' })],
          onMove,
          onTearEnd,
        }),
      ),
    );
    attachScroller(result.current.scrollerRef);

    act(() => result.current.onDragStart(startEvent('t1')));
    act(() => result.current.onDragEnd(endEvent('t1', 't2')));

    expect(onMove).toHaveBeenCalledWith('t1', 1);
    expect(onTearEnd).not.toHaveBeenCalled();
  });

  it('does nothing when the drop landed on no target', () => {
    const onMove = vi.fn();
    const { result } = renderHook(() => useTabStripDrag(args({ onMove })));
    attachScroller(result.current.scrollerRef);
    act(() => result.current.onDragStart(startEvent('t1')));
    act(() => result.current.onDragEnd(endEvent('t1', null)));
    expect(onMove).not.toHaveBeenCalled();
  });

  it('routes a group reorder and a group assignment to their own callbacks', () => {
    const onMoveGroup = vi.fn();
    const onAssignToGroup = vi.fn();
    const tabs = [tab({ id: 't1' }), tab({ id: 't2', groupId: 'g1' })];
    const { result } = renderHook(() =>
      useTabStripDrag(
        args({
          items: [`${GROUP_PREFIX}g1`, 't2', 't1'],
          tabs,
          groups: [group({ id: 'g1' })],
          onMoveGroup,
          onAssignToGroup,
        }),
      ),
    );
    attachScroller(result.current.scrollerRef);

    act(() => result.current.onDragStart(startEvent(`${GROUP_PREFIX}g1`)));
    act(() => result.current.onDragEnd(endEvent(`${GROUP_PREFIX}g1`, 't1')));
    expect(onMoveGroup).toHaveBeenCalled();

    // joining is dropping onto the group HEADER, which is what makes a collapsed group a target
    act(() => result.current.onDragStart(startEvent('t1')));
    act(() => result.current.onDragEnd(endEvent('t1', GROUP_PREFIX + 'g1')));
    expect(onAssignToGroup).toHaveBeenCalledWith('t1', 'g1');
  });

  it('does nothing when the drop resolves to no change at all', () => {
    // Dropping a tab back where it started is a real gesture and must not emit a move: the host
    // would journal a reorder that reorders nothing.
    const onMove = vi.fn();
    const { result } = renderHook(() => useTabStripDrag(args({ onMove })));
    attachScroller(result.current.scrollerRef);
    act(() => result.current.onDragStart(startEvent('t1')));
    act(() => result.current.onDragEnd(endEvent('t1', 't1')));
    expect(onMove).not.toHaveBeenCalled();
  });

  it('tears out a group that is no longer in the map without inventing a colour', () => {
    // The maps are rebuilt every render, so a group can vanish between grab and drag. The preview
    // still has to describe SOMETHING rather than throw mid-gesture.
    const onTearBegin = vi.fn();
    const bare: TabStripLabels = {
      tablist: 'Tabs',
      untitled: 'Untitled',
      closeTab: 'Close',
      newTab: 'New tab',
    };
    const { result } = renderHook(() =>
      useTabStripDrag(args({ groups: [], tabs: [], activeId: null, labels: bare, onTearBegin })),
    );
    attachScroller(result.current.scrollerRef);

    act(() => result.current.onDragStart(startEvent(`${GROUP_PREFIX}vanished`)));
    pointerMove({ clientX: 200, clientY: 500, screenX: 0, screenY: 0 });

    expect(onTearBegin.mock.calls[0]?.[0]).toMatchObject({
      item: { kind: 'group', id: 'vanished' },
      title: 'Group', // the built-in fallback, since these labels carry no unnamedGroup
      groupColor: null,
    });
  });

  it('cancelling a torn drag tells the host to drop its preview; cancelling a plain one does not', () => {
    const onTearCancel = vi.fn();
    const { result } = renderHook(() => useTabStripDrag(args({ onTearCancel })));
    attachScroller(result.current.scrollerRef);

    act(() => result.current.onDragStart(startEvent('t1')));
    act(() => result.current.onDragCancel());
    expect(onTearCancel).not.toHaveBeenCalled();

    act(() => result.current.onDragStart(startEvent('t1')));
    pointerMove({ clientX: 200, clientY: 500, screenX: 0, screenY: 0 });
    act(() => result.current.onDragCancel());
    expect(onTearCancel).toHaveBeenCalledTimes(1);
    expect(result.current.torn).toBe(false);
  });
});
