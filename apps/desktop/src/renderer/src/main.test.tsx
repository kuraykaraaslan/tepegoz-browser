// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The renderer bundle's ENTRY POINT — a native popup window or a `tepegoz://` internal page loads this
 * same bundle with a distinguishing URL param and it picks exactly one top-level component to mount (a
 * popup/page surface, or the full browser chrome as the default). All 20 candidate components are pure
 * routing DESTINATIONS here — each is separately covered on its own — so every one is mocked to a
 * capturing `vi.fn(() => null)` and this test only proves the ROUTING: which URL shape selects which
 * component (and with which props), the pre-paint `theme` param application, the drag-preview
 * transparent-background setup, and the container-missing no-op.
 *
 * The module runs its routing as TOP-LEVEL side-effecting code (not inside a function), so it can only
 * be exercised by setting up `window.location` + `document.getElementById('root')` and then DYNAMICALLY
 * importing it fresh — `vi.resetModules()` before each import. Crucially, every mocked component is ALSO
 * re-imported (dynamically, inside the test, AFTER `resetModules`) rather than referenced via a
 * module-top-level `import` — a static import resolves to the pre-reset module instance, a DIFFERENT
 * object from the one `main.tsx`'s own (post-reset) import of the same specifier receives, so a
 * `vi.mocked(StaticallyImportedThing)` assertion would silently watch the wrong function forever.
 */

vi.mock('./App', () => ({ App: vi.fn(() => null) }));
vi.mock('./components/PopupApp', () => ({ PopupApp: vi.fn(() => null) }));
vi.mock('./components/MainMenuPopup', () => ({ MainMenuPopup: vi.fn(() => null) }));
vi.mock('./components/MenuSubPopup', () => ({ MenuSubPopup: vi.fn(() => null) }));
vi.mock('./components/ExtensionsPanelPopup', () => ({ ExtensionsPanelPopup: vi.fn(() => null) }));
vi.mock('./components/PageContextMenuPopup', () => ({ PageContextMenuPopup: vi.fn(() => null) }));
vi.mock('./components/UserMenuPopup', () => ({ UserMenuPopup: vi.fn(() => null) }));
vi.mock('./components/NotificationCenterPopup', () => ({
  NotificationCenterPopup: vi.fn(() => null),
}));
vi.mock('./components/SiteInfoPopup', () => ({ SiteInfoPopup: vi.fn(() => null) }));
vi.mock('./components/TransferActivityPopup', () => ({ TransferActivityPopup: vi.fn(() => null) }));
vi.mock('./components/BookmarkFolderPopup', () => ({ BookmarkFolderPopup: vi.fn(() => null) }));
vi.mock('./components/BookmarkDialogPopup', () => ({ BookmarkDialogPopup: vi.fn(() => null) }));
vi.mock('./components/OnboardingApp', () => ({ OnboardingApp: vi.fn(() => null) }));
vi.mock('./components/SettingsPageSurface', () => ({ SettingsPageSurface: vi.fn(() => null) }));
vi.mock('./components/ExtensionsPageSurface', () => ({ ExtensionsPageSurface: vi.fn(() => null) }));
vi.mock('./components/HistoryPageSurface', () => ({ HistoryPageSurface: vi.fn(() => null) }));
vi.mock('./components/DownloadsPageSurface', () => ({ DownloadsPageSurface: vi.fn(() => null) }));
vi.mock('./components/UploadsPageSurface', () => ({ UploadsPageSurface: vi.fn(() => null) }));
vi.mock('./components/BookmarksPageSurface', () => ({ BookmarksPageSurface: vi.fn(() => null) }));
vi.mock('./components/ProcessPageSurface', () => ({ ProcessPageSurface: vi.fn(() => null) }));
vi.mock('./components/DeveloperPageSurface', () => ({ DeveloperPageSurface: vi.fn(() => null) }));
vi.mock('./components/DragPreviewSurface', () => ({ DragPreviewSurface: vi.fn(() => null) }));
vi.mock('./lib/theme', () => ({ applyTheme: vi.fn() }));

const originalLocationDescriptor = Object.getOwnPropertyDescriptor(window, 'location')!;

beforeEach(() => {
  document.documentElement.style.cssText = '';
  document.body.style.cssText = '';
  document.body.innerHTML = '<div id="root"></div>';
  window.history.pushState({}, '', '/');
  Object.defineProperty(window, 'tepegoz', { configurable: true, value: {} });
});
afterEach(() => {
  Object.defineProperty(window, 'location', originalLocationDescriptor);
  document.body.innerHTML = '';
  document.documentElement.style.cssText = '';
  document.body.style.cssText = '';
  window.history.pushState({}, '', '/');
});

/** Reset the module graph, set up the URL, import `main.tsx` fresh, and hand back a getter for the
 *  (also freshly re-imported) named export of `path` — the only way to see the SAME mock instance
 *  `main.tsx` itself just called. */
async function boot<T>(
  search: string,
  path: string,
  exportName: string,
  location?: { protocol: string; hostname: string },
): Promise<T> {
  vi.clearAllMocks();
  vi.resetModules();
  if (document.getElementById('root') !== null) document.body.innerHTML = '<div id="root"></div>';
  window.history.pushState({}, '', `/${search}`);
  if (location) {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...window.location, ...location, search },
    });
  }
  await import('./main');
  const mod = (await import(/* @vite-ignore */ path)) as Record<string, T>;
  return mod[exportName]!;
}

describe('main.tsx routing', () => {
  it.each([
    ['?surface=main-menu', './components/MainMenuPopup', 'MainMenuPopup'],
    ['?surface=page-context-menu', './components/PageContextMenuPopup', 'PageContextMenuPopup'],
    ['?surface=user-menu', './components/UserMenuPopup', 'UserMenuPopup'],
    ['?surface=extensions-panel', './components/ExtensionsPanelPopup', 'ExtensionsPanelPopup'],
    ['?surface=notifications', './components/NotificationCenterPopup', 'NotificationCenterPopup'],
    ['?surface=transfers', './components/TransferActivityPopup', 'TransferActivityPopup'],
    ['?surface=onboarding', './components/OnboardingApp', 'OnboardingApp'],
  ])('routes %s to its popup', async (search, path, exportName) => {
    const mocked = await boot<() => null>(search, path, exportName);
    expect(vi.mocked(mocked)).toHaveBeenCalled();
  });

  it('routes ?surface=menu-sub with its kind param', async () => {
    const mocked = await boot<(p: { kind: string }) => null>(
      '?surface=menu-sub&kind=bookmarks',
      './components/MenuSubPopup',
      'MenuSubPopup',
    );
    expect(vi.mocked(mocked)).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'bookmarks' }),
      expect.anything(),
    );
  });

  it('routes ?surface=menu-sub with no kind to an empty string', async () => {
    const mocked = await boot<(p: { kind: string }) => null>(
      '?surface=menu-sub',
      './components/MenuSubPopup',
      'MenuSubPopup',
    );
    expect(vi.mocked(mocked)).toHaveBeenCalledWith(expect.objectContaining({ kind: '' }), expect.anything());
  });

  it('routes ?surface=site-info with its url param', async () => {
    const mocked = await boot<(p: { url: string }) => null>(
      '?surface=site-info&url=https%3A%2F%2Fexample.com',
      './components/SiteInfoPopup',
      'SiteInfoPopup',
    );
    expect(vi.mocked(mocked)).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'https://example.com' }),
      expect.anything(),
    );
  });

  it('routes ?surface=site-info with no url to an empty string', async () => {
    const mocked = await boot<(p: { url: string }) => null>(
      '?surface=site-info',
      './components/SiteInfoPopup',
      'SiteInfoPopup',
    );
    expect(vi.mocked(mocked)).toHaveBeenCalledWith(expect.objectContaining({ url: '' }), expect.anything());
  });

  it('routes ?surface=bookmark-folder only once an id is present', async () => {
    const app = await boot<() => null>('?surface=bookmark-folder', './App', 'App');
    const folderPopup = (
      (await import('./components/BookmarkFolderPopup')) as unknown as Record<string, () => null>
    ).BookmarkFolderPopup;
    expect(vi.mocked(folderPopup)).not.toHaveBeenCalled();
    expect(vi.mocked(app)).toHaveBeenCalled();

    const mocked = await boot<(p: { folderId: string }) => null>(
      '?surface=bookmark-folder&id=f1',
      './components/BookmarkFolderPopup',
      'BookmarkFolderPopup',
    );
    expect(vi.mocked(mocked)).toHaveBeenCalledWith(expect.objectContaining({ folderId: 'f1' }), expect.anything());
  });

  it('routes bookmark-rename and bookmark-add-folder to BookmarkDialogPopup with the right mode', async () => {
    const rename = await boot<(p: { mode: string; id: string }) => null>(
      '?surface=bookmark-rename&id=b1',
      './components/BookmarkDialogPopup',
      'BookmarkDialogPopup',
    );
    expect(vi.mocked(rename)).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'rename', id: 'b1' }),
      expect.anything(),
    );

    const addFolder = await boot<(p: { mode: string; id: string }) => null>(
      '?surface=bookmark-add-folder&id=f1',
      './components/BookmarkDialogPopup',
      'BookmarkDialogPopup',
    );
    expect(vi.mocked(addFolder)).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'add-folder', id: 'f1' }),
      expect.anything(),
    );
  });

  it('routes ?surface=ext only once an id is present', async () => {
    const popupApp1 = await boot<() => null>('?surface=ext', './components/PopupApp', 'PopupApp');
    expect(vi.mocked(popupApp1)).not.toHaveBeenCalled();

    const popupApp2 = await boot<(p: { id: string }) => null>(
      '?surface=ext&id=ext.a',
      './components/PopupApp',
      'PopupApp',
    );
    expect(vi.mocked(popupApp2)).toHaveBeenCalledWith(expect.objectContaining({ id: 'ext.a' }), expect.anything());
  });

  it('routes ?surface=drag-preview with every query param threaded through', async () => {
    const mocked = await boot<(p: Record<string, unknown>) => null>(
      '?surface=drag-preview&title=My+Tab&favicon=https%3A%2F%2Fa.example%2Ficon.png&active=1&pinned=1&groupColor=blue&kind=group',
      './components/DragPreviewSurface',
      'DragPreviewSurface',
    );
    expect(vi.mocked(mocked)).toHaveBeenCalledWith(
      {
        title: 'My Tab',
        faviconUrl: 'https://a.example/icon.png',
        active: true,
        pinned: true,
        groupColor: 'blue',
        kind: 'group',
      },
      expect.anything(),
    );
  });

  it('defaults an unrecognized drag-preview kind to "tab"', async () => {
    const mocked = await boot<(p: Record<string, unknown>) => null>(
      '?surface=drag-preview',
      './components/DragPreviewSurface',
      'DragPreviewSurface',
    );
    expect(vi.mocked(mocked)).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'tab',
        active: false,
        pinned: false,
        faviconUrl: null,
        groupColor: null,
      }),
      expect.anything(),
    );
  });

  it('resets the background to transparent for the drag-preview window', async () => {
    await boot('?surface=drag-preview', './components/DragPreviewSurface', 'DragPreviewSurface');
    expect(document.documentElement.style.background).toBe('transparent');
    expect(document.body.style.background).toBe('transparent');
    expect(document.body.style.margin).toBe('0px');
    expect(document.body.style.overflow).toBe('hidden');
  });

  it('leaves the background alone for a non-drag-preview surface', async () => {
    await boot('?surface=main-menu', './components/MainMenuPopup', 'MainMenuPopup');
    expect(document.documentElement.style.background).toBe('');
    expect(document.body.style.background).toBe('');
  });

  it('applies the theme param before the first paint, and skips it when absent', async () => {
    const applyThemeOn = await boot<(theme: string, color: string) => void>(
      '?surface=main-menu&theme=dark&themeColor=%23112233',
      './lib/theme',
      'applyTheme',
    );
    expect(vi.mocked(applyThemeOn)).toHaveBeenCalledWith('dark', '#112233');

    const applyThemeOff = await boot<(theme: string, color: string) => void>(
      '?surface=main-menu',
      './lib/theme',
      'applyTheme',
    );
    expect(vi.mocked(applyThemeOff)).not.toHaveBeenCalled();
  });

  it('applies the theme param with an empty color when themeColor is absent', async () => {
    const applyThemeOn = await boot<(theme: string, color: string) => void>(
      '?surface=main-menu&theme=dark',
      './lib/theme',
      'applyTheme',
    );
    expect(vi.mocked(applyThemeOn)).toHaveBeenCalledWith('dark', '');
  });

  it.each([
    ['settings', './components/SettingsPageSurface', 'SettingsPageSurface'],
    ['extensions', './components/ExtensionsPageSurface', 'ExtensionsPageSurface'],
    ['history', './components/HistoryPageSurface', 'HistoryPageSurface'],
    ['downloads', './components/DownloadsPageSurface', 'DownloadsPageSurface'],
    ['uploads', './components/UploadsPageSurface', 'UploadsPageSurface'],
    ['bookmarks', './components/BookmarksPageSurface', 'BookmarksPageSurface'],
    ['process', './components/ProcessPageSurface', 'ProcessPageSurface'],
    ['developer', './components/DeveloperPageSurface', 'DeveloperPageSurface'],
  ])('routes the tepegoz:// host "%s" to its internal page surface', async (host, path, exportName) => {
    const mocked = await boot<() => null>('', path, exportName, { protocol: 'tepegoz:', hostname: host });
    expect(vi.mocked(mocked)).toHaveBeenCalled();
  });

  it('routes a dev-server ?page= param the same way a tepegoz:// host would', async () => {
    const mocked = await boot<() => null>(
      '?page=settings',
      './components/SettingsPageSurface',
      'SettingsPageSurface',
    );
    expect(vi.mocked(mocked)).toHaveBeenCalled();
  });

  it('falls back to the full browser chrome (App) when nothing else matches', async () => {
    const mocked = await boot<() => null>('', './App', 'App');
    expect(vi.mocked(mocked)).toHaveBeenCalled();
  });

  it('never mounts anything when the #root container is missing', async () => {
    document.body.innerHTML = '';
    const mocked = await boot<() => null>('?surface=main-menu', './components/MainMenuPopup', 'MainMenuPopup');
    expect(vi.mocked(mocked)).not.toHaveBeenCalled();
  });
});
