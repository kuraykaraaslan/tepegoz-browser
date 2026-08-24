import { describe, expect, it } from 'vitest';
import { SHORTCUTS } from '@tepegoz/shortcuts';
import type { MenuItem } from '@tepegoz/browser-menu';
import { accel, buildPageContextMenuModel, type PageContextMenuContext } from './model';
import { en } from './i18n/en';

/**
 * The menu may not advertise a key that nothing binds.
 *
 * It did, for as long as this menu has existed: the rows printed `Ctrl+P`, `Ctrl+S` and `Ctrl+U` as
 * free strings while `@tepegoz/shortcuts` — the registry that is the ONLY place a global key may be
 * bound — had no entry for any of the three. The commands worked by right-click and the keys did
 * nothing, which is worse than showing no shortcut at all: it teaches the user a key, and the key is
 * dead.
 *
 * So the property under test is not "print works" but "everything this menu SAYS is either bound by us
 * or bound by the platform" — the two are a closed set, and a row cannot claim anything else.
 */

const PLATFORM_BUILTIN_LABELS = new Set([
  '⌘X',
  '⌘C',
  '⌘V',
  '⌘A',
  '⌘←',
  '⌘→',
  'Ctrl+X',
  'Ctrl+C',
  'Ctrl+V',
  'Ctrl+A',
  'Alt+←',
  'Alt+→',
]);

function ctx(over: Partial<PageContextMenuContext> = {}): PageContextMenuContext {
  return {
    menuId: 'menu-1',
    contributions: [],
    canGoBack: true,
    canGoForward: true,
    selectionText: '',
    linkUrl: '',
    srcUrl: '',
    mediaType: 'none',
    isEditable: false,
    canCopy: true,
    canCut: true,
    canPaste: true,
    canSelectAll: true,
    ...over,
  };
}

function shortcutsOf(items: MenuItem[]): string[] {
  return items.flatMap((i) =>
    'shortcut' in i && typeof i.shortcut === 'string' ? [i.shortcut] : [],
  );
}

/** Every branch of the menu that can show a key: default page, editable field, link, and selection. */
function everyVariant(platform: string): string[] {
  const noop = (): void => undefined;
  const actions = new Proxy({}, { get: () => noop }) as never;
  return [
    ctx(),
    ctx({ isEditable: true }),
    ctx({ linkUrl: 'https://example.com' }),
    ctx({ selectionText: 'hello' }),
  ].flatMap((c) => shortcutsOf(buildPageContextMenuModel(en, c, actions, platform)));
}

describe('page context menu accelerators', () => {
  for (const platform of ['win32', 'darwin', 'linux']) {
    it(`only advertises keys that are bound, on ${platform}`, () => {
      const bound = new Set(SHORTCUTS.map((s) => accel(s.id, platform)));
      const shown = everyVariant(platform);

      expect(shown.length).toBeGreaterThan(0); // a menu with no keys would pass vacuously
      const unbound = shown.filter((s) => !bound.has(s) && !PLATFORM_BUILTIN_LABELS.has(s));
      expect(unbound).toEqual([]);
    });
  }

  /**
   * The three that were dead. Named individually rather than folded into the sweep above, so a
   * regression says WHICH command lost its key instead of just "something is unbound".
   */
  for (const id of ['print', 'savePage', 'viewSource'] as const) {
    it(`${id} is in the registry, so its menu row is not advertising a dead key`, () => {
      expect(SHORTCUTS.map((s) => s.id)).toContain(id);
    });
  }

  it('writes the platform notation, so a Mac is not told Ctrl', () => {
    expect(accel('print', 'darwin')).toBe('⌘P');
    expect(accel('print', 'win32')).toBe('Ctrl+P');
    // The history keys differ in SHAPE, not just notation — the old hardcoded string said Alt+← on
    // macOS too, which is simply the wrong key there.
    expect(accel('historyBack', 'darwin')).toBe('⌘←');
    expect(accel('historyBack', 'win32')).toBe('Alt+←');
  });
});
