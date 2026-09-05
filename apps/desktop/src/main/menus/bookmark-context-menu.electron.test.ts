import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MenuItemConstructorOptions } from 'electron';
import { IpcChannels } from '@tepegoz/desktop-ipc';

/**
 * Native right-click menu for a bar/manager bookmark or folder — a PURE DISPATCHER: every item just
 * sends `bookmarks:menu-action` to the renderer, which owns the tree and does the work. This keeps
 * all bookmark mutations on one renderer-driven path. The menu shape varies by variant / node type /
 * whether it's a fixed root.
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
    browser: {
      bookmarkMenu: {
        open: 'Open',
        openNewTab: 'Open in new tab',
        openAll: 'Open all',
        rename: 'Rename',
        addFolder: 'Add folder',
        delete: 'Delete',
        manager: 'Bookmark manager',
        moveToBar: 'Move to bar',
      },
    },
  }),
}));

const { showBookmarkContextMenu } = await import('./bookmark-context-menu');

const sent: unknown[] = [];
const win = {
  webContents: {
    send: (ch: string, p: unknown) => {
      sent.push({ ch, p });
    },
  },
} as never;
const labels = () => (built[0] ?? []).map((i) => i.label ?? `<${i.type}>`);
const clickAll = (): void => {
  for (const i of built[0] ?? []) (i.click as (() => void) | undefined)?.();
};

beforeEach(() => {
  built.length = 0;
  sent.length = 0;
});

describe('showBookmarkContextMenu', () => {
  it('a fixed root offers only Add folder + the manager', () => {
    showBookmarkContextMenu(win, 'root-bar', 'folder');
    expect(labels()).toEqual(['Add folder', '<separator>', 'Bookmark manager']);
    clickAll();
    expect((sent as { p: { action: string } }[]).map((m) => m.p.action)).toEqual([
      'add-folder',
      'open-manager',
    ]);
  });

  it('a plain bookmark: open / new tab / rename / move-to-bar / add-folder / delete / manager', () => {
    showBookmarkContextMenu(win, 'b1', 'bookmark');
    expect(labels()).toEqual([
      'Open',
      'Open in new tab',
      '<separator>',
      'Rename',
      'Move to bar',
      'Add folder',
      '<separator>',
      'Delete',
      '<separator>',
      'Bookmark manager',
    ]);
  });

  it('a folder: open all / rename / add-folder / delete / manager (no open, no move-to-bar)', () => {
    showBookmarkContextMenu(win, 'f1', 'folder');
    expect(labels()).toEqual([
      'Open all',
      '<separator>',
      'Rename',
      'Add folder',
      '<separator>',
      'Delete',
      '<separator>',
      'Bookmark manager',
    ]);
    clickAll();
    expect((sent as { p: { action: string } }[]).map((m) => m.p.action)).toEqual([
      'open-all',
      'rename',
      'add-folder',
      'delete',
      'open-manager',
    ]);
  });

  it('the folder-item variant (inside a bar dropdown) is the reduced set', () => {
    showBookmarkContextMenu(win, 'b1', 'bookmark', 'folder-item');
    expect(labels()).toEqual([
      'Open',
      'Open in new tab',
      '<separator>',
      'Move to bar',
      'Delete',
    ]);
    clickAll();
    expect((sent as { p: { action: string } }[]).map((m) => m.p.action)).toEqual([
      'open',
      'open-new-tab',
      'move-to-bar',
      'delete',
    ]);
  });

  it('the folder-item variant for a FOLDER offers open-all / move-to-bar / delete', () => {
    showBookmarkContextMenu(win, 'f2', 'folder', 'folder-item');
    expect(labels()).toEqual(['Open all', '<separator>', 'Move to bar', 'Delete']);
    clickAll();
    expect((sent as { p: { action: string } }[]).map((m) => m.p.action)).toEqual([
      'open-all',
      'move-to-bar',
      'delete',
    ]);
  });

  it('every item dispatches bookmarks:menu-action carrying its id + type', () => {
    showBookmarkContextMenu(win, 'b7', 'bookmark');
    clickAll();
    expect(sent.length).toBeGreaterThan(0);
    for (const msg of sent as { ch: string; p: { id: string; type: string } }[]) {
      expect(msg.ch).toBe(IpcChannels.bookmarksMenuAction);
      expect(msg.p.id).toBe('b7');
      expect(msg.p.type).toBe('bookmark');
    }
    const actions = (sent as { p: { action: string } }[]).map((m) => m.p.action);
    expect(actions).toContain('open');
    expect(actions).toContain('rename');
    expect(actions).toContain('delete');
  });
});
