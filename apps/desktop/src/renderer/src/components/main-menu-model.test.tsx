import { describe, expect, it, vi } from 'vitest';
import type { MenuAction, MenuItem } from '@tepegoz/browser-menu';
import { buildMainMenuModel, type MainMenuActions, type MainMenuCopy } from './main-menu-model';

/**
 * The main (hamburger) menu model — a pure builder, and the place two rules are actually enforced.
 *
 * RULE ONE: a row that is not wired must be visibly disabled. The menu deliberately ships
 * placeholders — features that exist as an icon before they exist as code — and the only thing keeping
 * that honest is `disabled: onSelect === undefined` inside one small helper. Get it backwards and the
 * menu offers a live-looking Print or Translate that does nothing when clicked, which reads as a broken
 * app rather than an unfinished one. Nothing else in the codebase checks it.
 *
 * RULE TWO: every string in this menu comes from the injected `copy`. This model mixes labels owned by
 * several dictionaries (ADR-0016), so it is exactly where a hardcoded English string would slip in and
 * survive: `i18next/no-literal-string` only flags literal JSX TEXT, and these are object properties.
 * The test walks the built model and asserts every user-visible string is one the caller supplied.
 *
 * Both are asserted structurally rather than by rendering — the model is the contract, and `<Menu>` has
 * its own tests in `@tepegoz/browser-menu`.
 */

/** Distinct sentinel strings, so "came from copy" is provable rather than coincidental. */
function copyFixture(): MainMenuCopy {
  let n = 0;
  const s = (): string => `copy-${String(++n)}`;
  return {
    newTab: s(),
    reopenTab: s(),
    reload: s(),
    exit: s(),
    settings: s(),
    history: s(),
    extensions: s(),
    menu: {
      newWindow: s(),
      newIncognito: s(),
      profileYou: s(),
      passwords: s(),
      downloads: s(),
      uploads: s(),
      tasks: s(),
      bookmarks: s(),
      tabGroups: s(),
      taskManager: s(),
      deleteBrowsingData: s(),
      zoom: s(),
      print: s(),
      searchLens: s(),
      translate: s(),
      findEdit: s(),
      castSaveShare: s(),
      moreTools: s(),
      help: s(),
      short: {
        newWindow: s(),
        newIncognito: s(),
        deleteBrowsingData: s(),
        passwords: s(),
        downloads: s(),
        uploads: s(),
        tasks: s(),
        bookmarks: s(),
        tabGroups: s(),
        print: s(),
        searchLens: s(),
        translate: s(),
        findEdit: s(),
        castSaveShare: s(),
        moreTools: s(),
        help: s(),
      },
    },
  };
}

function actionsFixture(): MainMenuActions {
  return {
    newTab: vi.fn(),
    reopenTab: vi.fn(),
    reload: vi.fn(),
    openDownloads: vi.fn(),
    openUploads: vi.fn(),
    openTasks: vi.fn(),
    openTaskManager: vi.fn(),
    openSettings: vi.fn(),
    exit: vi.fn(),
  };
}

/** Every string the caller supplied, flattened. */
function copyStrings(copy: MainMenuCopy): Set<string> {
  const out = new Set<string>();
  const walk = (value: unknown): void => {
    if (typeof value === 'string') out.add(value);
    else if (value !== null && typeof value === 'object')
      Object.values(value).forEach((v: unknown) => {
        walk(v);
      });
  };
  walk(copy);
  return out;
}

/** Every icon button across all `actions` rows. */
function allActions(model: MenuItem[]): MenuAction[] {
  return model.flatMap((item) => ('kind' in item && item.kind === 'actions' ? item.items : []));
}

/**
 * Every plain row — the `kind?: 'item'` arm only. Narrowed by `kind`, NOT by "has a label and an id":
 * the `zoom` arm has both, so the looser extract quietly folded it in and then lost `onSelect`,
 * `shortcut` and `flyout` from the narrowed type.
 */
type MenuRow = Extract<MenuItem, { kind?: 'item' }>;

function allRows(model: MenuItem[]): MenuRow[] {
  return model.filter(
    (item): item is MenuRow => !('kind' in item) || item.kind === undefined || item.kind === 'item',
  );
}

const copy = copyFixture();
const model = buildMainMenuModel(copy, actionsFixture());

describe('a row is disabled exactly when it is not wired', () => {
  it('has both wired and placeholder icon buttons, so the rule has something to hold', () => {
    const actions = allActions(model);
    expect(actions.some((a) => a.onSelect !== undefined)).toBe(true);
    expect(actions.some((a) => a.onSelect === undefined)).toBe(true);
  });

  it('greys every icon button that has no handler', () => {
    for (const action of allActions(model)) {
      // Reversed, the menu offers a live-looking Print that does nothing — a broken app, not an
      // unfinished one.
      expect(action.disabled, `${action.id} is a placeholder and must be disabled`).toBe(
        action.onSelect === undefined,
      );
    }
  });

  it('never ships a button that is both disabled and clickable', () => {
    for (const action of allActions(model)) {
      expect(action.disabled === true && action.onSelect !== undefined).toBe(false);
    }
  });

  it('leaves the zoom row disabled while it has no handlers', () => {
    const zoom = model.find((i) => 'kind' in i && i.kind === 'zoom');
    expect(zoom).toBeDefined();
    expect(zoom).toMatchObject({ disabled: true });
  });

  it('wires the zoom row (live value + handlers, not disabled) when a zoom control is supplied', () => {
    const onZoomIn = vi.fn();
    const onZoomOut = vi.fn();
    const onReset = vi.fn();
    const wired = buildMainMenuModel(copyFixture(), actionsFixture(), {
      value: 125,
      onZoomIn,
      onZoomOut,
      onReset,
    });
    const zoom = wired.find(
      (i): i is Extract<MenuItem, { kind: 'zoom' }> => 'kind' in i && i.kind === 'zoom',
    );
    expect(zoom).toBeDefined();
    expect(zoom?.disabled).toBeUndefined();
    expect(zoom?.value).toBe(125);
    zoom?.onZoomIn?.();
    zoom?.onZoomOut?.();
    zoom?.onReset?.();
    expect(onZoomIn).toHaveBeenCalledTimes(1);
    expect(onZoomOut).toHaveBeenCalledTimes(1);
    expect(onReset).toHaveBeenCalledTimes(1);
  });
});

describe('every string comes from the caller dictionary', () => {
  const supplied = copyStrings(copy);

  it('takes every row label from copy', () => {
    for (const row of allRows(model)) {
      expect(supplied.has(row.label), `row "${row.id}" invented the label ${row.label}`).toBe(true);
    }
  });

  it('takes every icon-button label AND caption from copy', () => {
    for (const action of allActions(model)) {
      expect(supplied.has(action.label), `${action.id} invented a label`).toBe(true);
      if (action.caption !== undefined) {
        expect(supplied.has(action.caption), `${action.id} invented a caption`).toBe(true);
      }
    }
  });

  it('takes the profile header text from copy', () => {
    const header = model.find((i) => 'kind' in i && i.kind === 'header');
    expect(header).toBeDefined();
    expect(supplied.has((header as { content: string }).content)).toBe(true);
  });

  it('gives every icon button a full label as well as a short caption', () => {
    // The caption is what fits under the icon; the label is the tooltip and the accessible name. A
    // caption-only button is unreadable to a screen reader.
    for (const action of allActions(model)) {
      expect(action.label.length, `${action.id} has no full label`).toBeGreaterThan(0);
    }
  });
});

describe('wiring', () => {
  it('routes each wired row to its own action, with nothing crossed', () => {
    const actions = actionsFixture();
    const wired = buildMainMenuModel(copyFixture(), actions);
    const byId = new Map(allRows(wired).map((r) => [r.id, r]));
    const buttons = new Map(allActions(wired).map((a) => [a.id, a]));

    byId.get('new-tab')?.onSelect?.();
    expect(actions.newTab).toHaveBeenCalledTimes(1);

    byId.get('settings')?.onSelect?.();
    expect(actions.openSettings).toHaveBeenCalledTimes(1);

    byId.get('exit')?.onSelect?.();
    expect(actions.exit).toHaveBeenCalledTimes(1);

    buttons.get('downloads')?.onSelect?.();
    expect(actions.openDownloads).toHaveBeenCalledTimes(1);

    buttons.get('tasks')?.onSelect?.();
    expect(actions.openTasks).toHaveBeenCalledTimes(1);

    // Nothing else fired along the way.
    expect(actions.reload).not.toHaveBeenCalled();
    expect(actions.reopenTab).not.toHaveBeenCalled();
  });

  it('gives the shortcut hints the app actually binds', () => {
    const byId = new Map(allRows(model).map((r) => [r.id, r]));
    expect(byId.get('new-tab')?.shortcut).toBe('Ctrl+T');
    expect(byId.get('reopen-tab')?.shortcut).toBe('Ctrl+Shift+T');
    expect(byId.get('settings')?.shortcut).toBe('Ctrl+,');
  });
});

describe('structure', () => {
  it('keeps every id unique, since ids are what the host routes flyouts by', () => {
    const ids = [
      ...allRows(model).map((r) => r.id),
      ...allActions(model).map((a) => a.id),
      ...model.flatMap((i) => ('kind' in i && i.kind === 'actions' ? [i.id] : [])),
    ];
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('marks bookmarks, history and extensions as flyout parents with NO inline children', () => {
    // They open as separate native windows to the left: a native popup cannot overflow its own
    // bounds, so an inline submenu is not an option. Inlining extension names here would also make
    // the menu grow with every installed extension.
    for (const id of ['bookmarks', 'history', 'extensions']) {
      const row = allRows(model).find((r) => r.id === id);
      expect(row?.flyout, `${id} must be a flyout parent`).toBe(true);
      expect(row).not.toHaveProperty('items');
      expect(row?.onSelect).toBeUndefined();
    }
  });

  it('does not open or close with a separator', () => {
    const isSeparator = (i: MenuItem): boolean => 'kind' in i && i.kind === 'separator';
    expect(isSeparator(model[0] as MenuItem)).toBe(false);
    expect(isSeparator(model.at(-1) as MenuItem)).toBe(false);
  });

  it('never places two separators back to back', () => {
    const kinds = model.map((i) => ('kind' in i ? i.kind : 'item'));
    for (let i = 1; i < kinds.length; i++) {
      expect(kinds[i] === 'separator' && kinds[i - 1] === 'separator').toBe(false);
    }
  });
});
