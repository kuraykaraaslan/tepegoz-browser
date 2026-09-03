import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MenuItemConstructorOptions } from 'electron';
import { IpcChannels } from '@tepegoz/desktop-ipc';

/**
 * Native right-click menu for an extension icon. "Settings page" / "Unpin" / "Remove" are RELAYED to
 * the owning chrome window (so the action runs against the renderer's authoritative pinned/enabled
 * state); when the right-click came from the Extensions-panel popup, that popup is dismissed first.
 */

const built: MenuItemConstructorOptions[][] = [];
vi.mock('electron', () => ({
  Menu: {
    buildFromTemplate: (t: MenuItemConstructorOptions[]) => {
      built.push(t);
      return { popup: vi.fn() };
    },
  },
}));
vi.mock('../lib/i18n-main', () => ({
  mainStrings: () => ({
    extensions: {
      settingsPage: 'Settings page',
      unpin: 'Unpin',
      remove: 'Remove',
      manage: 'Manage extensions',
    },
  }),
}));

interface ManifestStub {
  surfaces: string[];
}
const state = vi.hoisted((): {
  manifest: ManifestStub | undefined;
  pinned: string[];
  destroyed: boolean;
  sent: unknown[];
  sameWindow: boolean;
} => ({
  manifest: { surfaces: ['page'] },
  pinned: [],
  destroyed: false,
  sent: [],
  sameWindow: true,
}));
vi.mock('@tepegoz/preferences', () => ({
  default: { getAll: () => ({ pinnedExtensions: state.pinned }) },
}));
vi.mock('../../shared/extensions', () => ({ manifestById: () => state.manifest }));
const chromeStub = {
  isDestroyed: () => state.destroyed,
  webContents: {
    send: (ch: string, p: unknown) => {
      state.sent.push({ ch, p });
    },
  },
};
vi.mock('../lib/chrome-window', () => ({
  chromeWindowFor: (win: unknown) => (state.sameWindow ? win : chromeStub),
}));
const popupClose = vi.fn();
vi.mock('../popup-window', () => ({
  default: {
    close: () => {
      popupClose();
    },
  },
}));
const openInternalPage = vi.fn();
vi.mock('../tabs', () => ({
  default: {
    openInternalPage: (u: string) => {
      openInternalPage(u);
    },
  },
}));

const { showExtensionContextMenu } = await import('./extension-context-menu');
// A DISTINCT object from `chromeStub` (so `chrome !== win` detects the popup case), but with its own
// `webContents.send` for when `chromeWindowFor` returns it (the same-window case).
const win = {
  isDestroyed: () => state.destroyed,
  webContents: {
    send: (ch: string, p: unknown) => {
      state.sent.push({ ch, p });
    },
  },
} as never;
const labels = (t: MenuItemConstructorOptions[]) => t.map((i) => i.label ?? `<${i.type}>`);
function click(t: MenuItemConstructorOptions[], label: string): void {
  (t.find((i) => i.label === label)?.click as (() => void) | undefined)?.();
}

beforeEach(() => {
  built.length = 0;
  state.manifest = { surfaces: ['page'] };
  state.pinned = [];
  state.destroyed = false;
  state.sent = [];
  state.sameWindow = true;
  popupClose.mockClear();
  openInternalPage.mockClear();
});

describe('showExtensionContextMenu', () => {
  it('builds nothing for an unknown / stale extension id', () => {
    state.manifest = undefined;
    showExtensionContextMenu(win, 'ext.gone');
    expect(built).toHaveLength(0);
  });

  it('disables "Settings page" when the extension declares no page surface', () => {
    state.manifest = { surfaces: [] };
    showExtensionContextMenu(win, 'ext.a');
    expect(built[0]?.find((i) => i.label === 'Settings page')?.enabled).toBe(false);
  });

  it('offers "Unpin" only for a pinned extension', () => {
    showExtensionContextMenu(win, 'ext.a');
    expect(labels(built[0] ?? [])).not.toContain('Unpin');
    built.length = 0;
    state.pinned = ['ext.a'];
    showExtensionContextMenu(win, 'ext.a');
    expect(labels(built[0] ?? [])).toContain('Unpin');
  });

  it('relays "unpin" to the chrome window when the Unpin item is clicked', () => {
    state.pinned = ['ext.a'];
    showExtensionContextMenu(win, 'ext.a');
    click(built[0] ?? [], 'Unpin');
    expect(state.sent).toEqual([
      { ch: IpcChannels.extensionContextMenuAction, p: { id: 'ext.a', action: 'unpin' } },
    ]);
  });

  it('relays the chosen action to the chrome window (no popup close when it IS the chrome)', () => {
    showExtensionContextMenu(win, 'ext.a');
    click(built[0] ?? [], 'Remove');
    expect(state.sent).toEqual([
      { ch: IpcChannels.extensionContextMenuAction, p: { id: 'ext.a', action: 'remove' } },
    ]);
    expect(popupClose).not.toHaveBeenCalled();
  });

  it('from the Extensions-panel popup: dismiss the popup, then relay to the owning chrome window', () => {
    state.sameWindow = false;
    showExtensionContextMenu(win, 'ext.a');
    click(built[0] ?? [], 'Settings page');
    expect(popupClose).toHaveBeenCalledTimes(1);
    expect(state.sent).toHaveLength(1);
  });

  it('"Manage extensions" opens the manager tab directly', () => {
    showExtensionContextMenu(win, 'ext.a');
    click(built[0] ?? [], 'Manage extensions');
    expect(openInternalPage).toHaveBeenCalled();
  });
});
