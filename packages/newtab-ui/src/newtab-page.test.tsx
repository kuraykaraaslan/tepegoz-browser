// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { I18nProvider } from '@tepegoz/i18n/react';
import type { NewTabShortcut } from '@tepegoz/desktop-ipc';
import { NewTabPage, type NewTabPageProps } from './newtab-page';
import { MAX_SHORTCUTS } from './newtab-page-helpers';
import type { ResolvedNewTabBackground } from './backgrounds';

/**
 * `tepegoz://newtab` — the page every new tab opens on, so most of what it does is a first
 * impression: the search box, the shortcut tiles, and the two corner entry points.
 *
 * The capability props are all OPTIONAL, and the page is expected to hide the affordance rather than
 * offer one that does nothing: no add handler means no "+" tile, no edit/remove handler means no
 * right-click menu at all.
 *
 * One branch stays uncovered: `saveDialog`'s `dialog === null` guard. The dialog only renders while
 * that state is non-null, so its own save button cannot be pressed without it.
 */

const BACKGROUND: ResolvedNewTabBackground = {
  kind: 'default',
  color: '#000000',
  svgId: '',
  imageRef: '',
  imageFit: 'cover',
  opacity: 1,
} as ResolvedNewTabBackground;

const shortcut = (id: string, title: string, url: string): NewTabShortcut => ({ id, title, url });

/**
 *  genuinely REMOVES a capability prop rather than passing it as undefined, which
 *  forbids — and "absent" is the shape the page branches on.
 */
function renderPage(over: Partial<NewTabPageProps> = {}, omit: (keyof NewTabPageProps)[] = []) {
  const props: NewTabPageProps = {
    shortcuts: [shortcut('s1', 'Docs', 'https://docs.example/')],
    onOpenShortcut: vi.fn(),
    onSearch: vi.fn(),
    onOpenAgent: vi.fn(),
    onAddShortcut: vi.fn(),
    onEditShortcut: vi.fn(),
    onRemoveShortcut: vi.fn(),
    background: BACKGROUND,
    onChangeBackground: vi.fn(),
    onPickBackgroundImage: vi.fn(() => Promise.resolve(null)),
    ...over,
  };
  for (const key of omit) delete (props as Partial<NewTabPageProps>)[key];
  render(
    <I18nProvider locale="en">
      <NewTabPage {...props} />
    </I18nProvider>,
  );
  return props;
}

const searchBox = (): HTMLElement => screen.getByRole('textbox', { name: 'Search' });
const submitSearch = (): void => {
  fireEvent.submit(screen.getByRole('search'));
};

afterEach(cleanup);

describe('the search box', () => {
  it('hands a typed query to the host', () => {
    const { onSearch } = renderPage();
    fireEvent.change(searchBox(), { target: { value: 'kuray' } });
    submitSearch();
    expect(onSearch).toHaveBeenCalledWith('kuray');
  });

  it('trims what it sends, so a stray space is not searched for', () => {
    const { onSearch } = renderPage();
    fireEvent.change(searchBox(), { target: { value: '  weather  ' } });
    submitSearch();
    expect(onSearch).toHaveBeenCalledWith('weather');
  });

  it('does nothing on an empty or whitespace-only submit', () => {
    // Enter on an untouched box is the most likely accidental submit on this page.
    const { onSearch } = renderPage();
    submitSearch();
    fireEvent.change(searchBox(), { target: { value: '   ' } });
    submitSearch();
    expect(onSearch).not.toHaveBeenCalled();
  });
});

describe('the shortcut tiles', () => {
  it('opens a shortcut in the current tab', () => {
    const { onOpenShortcut } = renderPage();
    fireEvent.click(screen.getByRole('button', { name: /Docs/ }));
    expect(onOpenShortcut).toHaveBeenCalledWith('https://docs.example/');
  });

  it('labels a tile by its host when the shortcut has no name', () => {
    // A nameless tile would be an initial over a blank line; the host is what the user recognises.
    renderPage({ shortcuts: [shortcut('s1', '', 'https://news.example.test/world')] });
    expect(screen.getByText('news.example.test')).toBeDefined();
  });

  it('caps the grid, so a long list cannot push the page into a scroll', () => {
    const many = Array.from({ length: MAX_SHORTCUTS + 4 }, (_, i) =>
      shortcut(`s${String(i)}`, `Site ${String(i)}`, `https://s${String(i)}.test/`),
    );
    renderPage({ shortcuts: many });
    // the capped tiles, and no "+" tile because the grid is full
    expect(screen.getAllByRole('listitem')).toHaveLength(MAX_SHORTCUTS);
    expect(screen.queryByRole('button', { name: 'Add shortcut' })).toBeNull();
  });

  it('offers the add tile while there is room for one', () => {
    renderPage();
    expect(screen.getByRole('button', { name: 'Add shortcut' })).toBeDefined();
  });

  it('hides the add tile entirely when the host cannot add', () => {
    renderPage({}, ['onAddShortcut']);
    expect(screen.queryByRole('button', { name: 'Add shortcut' })).toBeNull();
  });

  it('says the grid is empty only when there is nothing to show AND nothing to add', () => {
    renderPage({ shortcuts: [] }, ['onAddShortcut']);
    expect(screen.getByText(/No shortcuts yet/)).toBeDefined();

    cleanup();
    // with an add handler the "+" tile IS something to show, so the empty line would be wrong
    renderPage({ shortcuts: [] });
    expect(screen.queryByText(/No shortcuts yet/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Add shortcut' })).toBeDefined();
  });
});

describe('keyboard navigation across the shortcuts grid', () => {
  // Seven shortcuts + the "add" tile = eight cells in a five-wide grid (top row 0..4, then 5..7).
  const seven = Array.from({ length: 7 }, (_, i) =>
    shortcut(`s${String(i)}`, `Site ${String(i)}`, `https://s${String(i)}.test/`),
  );
  const grid = (): HTMLElement => screen.getByRole('list', { name: 'Shortcuts' });
  const cells = (): HTMLElement[] => within(grid()).getAllByRole('button');

  it('keeps exactly one cell in the tab order at rest', () => {
    renderPage({ shortcuts: seven });
    const tabbable = cells().filter((b) => b.getAttribute('tabindex') === '0');
    expect(tabbable).toHaveLength(1);
    expect(tabbable[0]).toBe(cells()[0]);
    expect(cells().filter((b) => b.getAttribute('tabindex') === '-1')).toHaveLength(7);
  });

  it('moves focus one cell on Arrow Right/Left and one row on Arrow Down/Up', () => {
    renderPage({ shortcuts: seven });
    cells()[0].focus();

    fireEvent.keyDown(grid(), { key: 'ArrowRight' });
    expect(document.activeElement).toBe(cells()[1]);
    // the roving tabindex follows the focus
    expect(cells()[1].getAttribute('tabindex')).toBe('0');
    expect(cells()[0].getAttribute('tabindex')).toBe('-1');

    fireEvent.keyDown(grid(), { key: 'ArrowDown' });
    expect(document.activeElement).toBe(cells()[6]);

    fireEvent.keyDown(grid(), { key: 'ArrowUp' });
    expect(document.activeElement).toBe(cells()[1]);

    fireEvent.keyDown(grid(), { key: 'ArrowLeft' });
    expect(document.activeElement).toBe(cells()[0]);
  });

  it('jumps to the first and last cell on Home and End', () => {
    renderPage({ shortcuts: seven });
    cells()[2].focus();

    fireEvent.keyDown(grid(), { key: 'End' });
    expect(document.activeElement).toBe(cells()[7]); // the "add" tile is the last cell
    expect(screen.getByRole('button', { name: 'Add shortcut' }).getAttribute('tabindex')).toBe('0');

    fireEvent.keyDown(grid(), { key: 'Home' });
    expect(document.activeElement).toBe(cells()[0]);
  });

  it('does not let arrow keys push focus out of the grid at the edges', () => {
    renderPage({ shortcuts: seven });
    cells()[0].focus();
    fireEvent.keyDown(grid(), { key: 'ArrowLeft' });
    fireEvent.keyDown(grid(), { key: 'ArrowUp' });
    expect(document.activeElement).toBe(cells()[0]);

    cells()[7].focus();
    fireEvent.keyDown(grid(), { key: 'ArrowRight' });
    fireEvent.keyDown(grid(), { key: 'ArrowDown' });
    expect(document.activeElement).toBe(cells()[7]);
  });

  it('activates the focused tile on Enter and on Space', () => {
    const { onOpenShortcut } = renderPage({ shortcuts: seven });
    cells()[0].focus();
    fireEvent.keyDown(grid(), { key: 'ArrowRight' });

    fireEvent.keyDown(grid(), { key: 'Enter' });
    expect(onOpenShortcut).toHaveBeenLastCalledWith('https://s1.test/');

    fireEvent.keyDown(grid(), { key: ' ' });
    expect(onOpenShortcut).toHaveBeenLastCalledWith('https://s1.test/');
  });

  it('names the grid and every tile for assistive tech', () => {
    renderPage({ shortcuts: [shortcut('s1', 'Docs', 'https://docs.example/')] });
    expect(grid()).toBeDefined();
    expect(screen.getByRole('button', { name: 'Docs' })).toBeDefined();
  });
});

describe('editing shortcuts', () => {
  const openMenu = (): void => {
    fireEvent.contextMenu(screen.getByRole('button', { name: /Docs/ }), {
      clientX: 10,
      clientY: 20,
    });
  };

  it('opens a context menu on a tile and edits through the dialog', () => {
    const { onEditShortcut } = renderPage();
    openMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Edit' }));

    // the dialog opens seeded with the existing values
    expect(screen.getByDisplayValue('Docs')).toBeDefined();
    expect(screen.getByDisplayValue('https://docs.example/')).toBeDefined();

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Handbook' } });
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));

    expect(onEditShortcut).toHaveBeenCalledWith('s1', 'Handbook', 'https://docs.example/');
  });

  it('removes through the menu without opening a dialog', () => {
    const { onRemoveShortcut } = renderPage();
    openMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Remove' }));

    expect(onRemoveShortcut).toHaveBeenCalledWith('s1');
    expect(screen.queryByRole('button', { name: 'Done' })).toBeNull();
  });

  it('adds through the "+" tile, with an empty dialog', () => {
    const { onAddShortcut } = renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Add shortcut' }));

    expect(screen.getByLabelText<HTMLInputElement>('Name').value).toBe('');
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'New' } });
    fireEvent.change(screen.getByLabelText('URL'), { target: { value: 'https://new.test/' } });
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));

    expect(onAddShortcut).toHaveBeenCalledWith('New', 'https://new.test/');
  });

  it('cancelling the dialog writes nothing', () => {
    const { onAddShortcut } = renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Add shortcut' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onAddShortcut).not.toHaveBeenCalled();
    expect(screen.queryByLabelText('Name')).toBeNull();
  });

  it('dismisses the tile menu on a click outside it', () => {
    // The menu is a bare overlay, not a native one — nothing else closes it, so a click that lands
    // anywhere else has to.
    renderPage();
    openMenu();
    expect(screen.getByRole('menuitem', { name: 'Edit' })).toBeDefined();

    fireEvent.click(screen.getByRole('menuitem', { name: 'Edit' }).closest('div')!.parentElement!);
    expect(screen.queryByRole('menuitem', { name: 'Edit' })).toBeNull();
  });

  it('offers no right-click menu at all when the host can neither edit nor remove', () => {
    // An affordance that does nothing is worse than none: the menu would open onto two dead items.
    renderPage({}, ['onEditShortcut', 'onRemoveShortcut']);
    openMenu();
    expect(screen.queryByRole('menuitem', { name: 'Edit' })).toBeNull();
    expect(screen.queryByRole('menuitem', { name: 'Remove' })).toBeNull();
  });
});

describe('the corner entry points', () => {
  it('opens the agent console', () => {
    const { onOpenAgent } = renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'AI' }));
    expect(onOpenAgent).toHaveBeenCalled();
  });

  it('toggles the customize panel, and reports its state to assistive tech', () => {
    renderPage();
    const button = screen.getByRole('button', { name: 'Customize' });
    expect(button.getAttribute('aria-pressed')).toBe('false');

    fireEvent.click(button);
    expect(screen.getByRole('button', { name: 'Customize' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
    expect(screen.getByText('Customize this page')).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Customize' }));
    expect(screen.queryByText('Customize this page')).toBeNull();
  });

  it('closes the customize panel from inside it', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Customize' }));
    const panel = screen.getByText('Customize this page').closest('div');
    fireEvent.click(within(panel as HTMLElement).getByRole('button', { name: 'Close' }));
    expect(screen.queryByText('Customize this page')).toBeNull();
  });
});
