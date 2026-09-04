// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ExtensionManifestWire } from '@tepegoz/desktop-ipc';
import type { ExtensionSurfaceKind } from '@tepegoz/extension-sdk';
import { ExtensionTray } from './ExtensionTray';
import type { ExtensionDef } from '../extensions/registry';

/**
 * The pinned toolbar icons + the puzzle button. Chrome's model: only pinned+enabled extensions get an
 * icon, dragging one reorders the pinned list, a single click fires immediately unless the extension
 * also binds a double-click (then it waits briefly to tell the two apart), and the puzzle opens/closes
 * a native popup window whose close main can report back independently (clicking elsewhere).
 */

let popupClosedCb: (surface: string) => void = () => undefined;

const bridge = {
  onPopupClosed: vi.fn((cb: (surface: string) => void) => {
    popupClosedCb = cb;
    return () => undefined;
  }),
  openPopup: vi.fn(),
  closePopup: vi.fn(),
  showExtensionContextMenu: vi.fn(),
};

function wire(id: string, surfaces: ExtensionSurfaceKind[] = [], hasDouble = false): ExtensionManifestWire {
  return {
    id,
    name: id,
    version: '1.0.0',
    description: '',
    icon: 'robot',
    surfaces,
    actions: { click: surfaces[0], doubleClick: hasDouble ? 'sidebar' : undefined },
    labels: {},
    permissions: [],
  };
}

function def(id: string, hasDouble = false): ExtensionDef {
  return {
    id,
    manifest: wire(id, [], hasDouble),
    icon: <span data-testid={`icon-${id}`}>*</span>,
    surfaces: {},
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(window, 'tepegoz', { configurable: true, value: bridge });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function renderTray(over: Partial<Parameters<typeof ExtensionTray>[0]> = {}) {
  const onExtensionAction = vi.fn();
  const onReorderPinned = vi.fn();
  render(
    <ExtensionTray
      locale="en"
      extensions={[def('a'), def('b')]}
      extensionStates={[
        { id: 'a', status: 'enabled' },
        { id: 'b', status: 'enabled' },
      ]}
      pinnedIds={['a', 'b']}
      activeExtensionId={null}
      onExtensionAction={onExtensionAction}
      onReorderPinned={onReorderPinned}
      {...over}
    />,
  );
  return { onExtensionAction, onReorderPinned };
}

describe('ExtensionTray', () => {
  it('shows one icon per pinned+enabled extension, and marks the active one pressed', () => {
    renderTray({ activeExtensionId: 'b' });
    const a = screen.getByRole('button', { name: 'a' });
    const b = screen.getByRole('button', { name: 'b' });
    expect(a.getAttribute('aria-pressed')).toBe('false');
    expect(b.getAttribute('aria-pressed')).toBe('true');
  });

  it('omits a pinned-but-disabled extension', () => {
    renderTray({ extensionStates: [{ id: 'a', status: 'enabled' }, { id: 'b', status: 'disabled' }] });
    expect(screen.getByRole('button', { name: 'a' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'b' })).toBeNull();
  });

  it('fires the click action immediately for an extension with no double-click binding', () => {
    const { onExtensionAction } = renderTray();
    fireEvent.click(screen.getByRole('button', { name: 'a' }));
    expect(onExtensionAction).toHaveBeenCalledTimes(1);
    expect(onExtensionAction.mock.calls[0]![1]).toBe('click');
  });

  it('defers a single click, then fires doubleClick immediately on a second click within the window', () => {
    vi.useFakeTimers();
    const onExtensionAction = vi.fn();
    render(
      <ExtensionTray
        locale="en"
        extensions={[def('a', true)]}
        extensionStates={[{ id: 'a', status: 'enabled' }]}
        pinnedIds={['a']}
        activeExtensionId={null}
        onExtensionAction={onExtensionAction}
        onReorderPinned={vi.fn()}
      />,
    );
    const btn = screen.getByRole('button', { name: 'a' });

    fireEvent.click(btn);
    expect(onExtensionAction).not.toHaveBeenCalled();
    fireEvent.click(btn);
    expect(onExtensionAction).toHaveBeenCalledTimes(1);
    expect(onExtensionAction.mock.calls[0]![1]).toBe('doubleClick');

    // the deferred single-click timer never fires afterward
    vi.advanceTimersByTime(300);
    expect(onExtensionAction).toHaveBeenCalledTimes(1);
  });

  it('fires the deferred single click alone when no second click arrives', () => {
    vi.useFakeTimers();
    const onExtensionAction = vi.fn();
    render(
      <ExtensionTray
        locale="en"
        extensions={[def('a', true)]}
        extensionStates={[{ id: 'a', status: 'enabled' }]}
        pinnedIds={['a']}
        activeExtensionId={null}
        onExtensionAction={onExtensionAction}
        onReorderPinned={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'a' }));
    vi.advanceTimersByTime(300);
    expect(onExtensionAction).toHaveBeenCalledWith('a', 'click', expect.anything());
  });

  it('opens the native context menu for an icon', () => {
    renderTray();
    fireEvent.contextMenu(screen.getByRole('button', { name: 'a' }));
    expect(bridge.showExtensionContextMenu).toHaveBeenCalledWith('a');
  });

  it('reorders the pinned list on a drag-and-drop between icons', () => {
    const { onReorderPinned } = renderTray();
    fireEvent.dragStart(screen.getByRole('button', { name: 'a' }));
    fireEvent.dragOver(screen.getByRole('button', { name: 'b' }));
    fireEvent.drop(screen.getByRole('button', { name: 'b' }));
    expect(onReorderPinned).toHaveBeenCalledWith(['b', 'a']);
  });

  it('opens the Extensions panel from the puzzle button, then closes it on a second click', () => {
    renderTray();
    const puzzle = screen.getByRole('button', { name: /Extensions/i });
    expect(puzzle.getAttribute('aria-expanded')).toBe('false');

    fireEvent.click(puzzle);
    expect(bridge.openPopup).toHaveBeenCalledWith(
      'extensions-panel',
      expect.any(Object),
      expect.any(Object),
    );
    expect(puzzle.getAttribute('aria-expanded')).toBe('true');

    fireEvent.click(puzzle);
    expect(bridge.closePopup).toHaveBeenCalledTimes(1);
    expect(puzzle.getAttribute('aria-expanded')).toBe('false');
  });

  it('resets the open state when main reports the extensions panel closed', () => {
    renderTray();
    const puzzle = screen.getByRole('button', { name: /Extensions/i });
    fireEvent.click(puzzle);
    expect(puzzle.getAttribute('aria-expanded')).toBe('true');

    act(() => popupClosedCb('extensions-panel'));
    expect(puzzle.getAttribute('aria-expanded')).toBe('false');
  });
});
