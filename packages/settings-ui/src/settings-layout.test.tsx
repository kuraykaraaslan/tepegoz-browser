// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { I18nProvider } from '@tepegoz/i18n/react';
import { SettingsLayout, type SettingsSection } from './settings-layout';

/**
 * The settings shell: a sidebar of sections, a search box that filters ACROSS sections, and the
 * address bar as the section pointer.
 *
 * That last one is the load-bearing part. Settings is a real page (`tepegoz://settings`), so a
 * section that lives only in React state is a section the back button, a bookmark, and "copy a link
 * to this setting" all cannot reach — three affordances the page otherwise looks like it has.
 */

const section = (
  id: string,
  label: string,
  over: Partial<SettingsSection> = {},
): SettingsSection => ({
  id,
  label,
  icon: <span data-testid={`icon-${id}`} />,
  searchText: `${label} ${id}`,
  content: <p>{`${label} content`}</p>,
  ...over,
});

const SECTIONS: SettingsSection[] = [
  section('general', 'General', { group: 'Basics', searchText: 'General homepage startup' }),
  section('appearance', 'Appearance', { group: 'Basics', searchText: 'Appearance theme colour' }),
  section('privacy', 'Privacy', { group: 'Advanced', searchText: 'Privacy cookies tracking' }),
];

function renderLayout(over: Partial<Parameters<typeof SettingsLayout>[0]> = {}) {
  render(
    <I18nProvider locale="en">
      <SettingsLayout titleIcon={<span data-testid="title-icon" />} sections={SECTIONS} {...over} />
    </I18nProvider>,
  );
}

const nav = (): HTMLElement => screen.getByRole('navigation');
const searchBox = (): HTMLElement => screen.getByLabelText('Search settings');

beforeEach(() => {
  window.location.hash = '';
});
afterEach(() => {
  cleanup();
  window.location.hash = '';
});

describe('the sidebar', () => {
  it('lists every section, heading each group once rather than above every row', () => {
    renderLayout();
    for (const s of SECTIONS) {
      expect(within(nav()).getByRole('button', { name: new RegExp(s.label) })).toBeDefined();
    }
    // "Basics" covers two sections and must appear once; "Advanced" once for its one section
    expect(within(nav()).getAllByText('Basics')).toHaveLength(1);
    expect(within(nav()).getAllByText('Advanced')).toHaveLength(1);
  });

  it('opens the first section by default and marks it current', () => {
    renderLayout();
    expect(screen.getByText('General content')).toBeDefined();
    expect(screen.queryByText('Privacy content')).toBeNull();
    expect(
      within(nav())
        .getByRole('button', { name: /General/ })
        .getAttribute('aria-current'),
    ).toBe('true');
  });

  it('honours an initial section the host asked for', () => {
    renderLayout({ initialSectionId: 'privacy' });
    expect(screen.getByText('Privacy content')).toBeDefined();
    expect(screen.queryByText('General content')).toBeNull();
  });

  it('ignores an initial section that does not exist, rather than showing an empty page', () => {
    // A stale bookmark to a section that has since been renamed still has to open Settings.
    renderLayout({ initialSectionId: 'no-such-section' });
    expect(screen.getByText('General content')).toBeDefined();
  });
});

describe('the address bar is the section pointer', () => {
  it('writes the section into the hash when one is chosen', () => {
    renderLayout();
    fireEvent.click(within(nav()).getByRole('button', { name: /Privacy/ }));
    expect(window.location.hash).toBe('#privacy');
    expect(screen.getByText('Privacy content')).toBeDefined();
  });

  it('follows back and forward, which is what makes the hash worth writing', () => {
    renderLayout();
    act(() => {
      window.location.hash = '#appearance';
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    expect(screen.getByText('Appearance content')).toBeDefined();
  });

  it('ignores a hash that names no section, so a stray fragment cannot blank the page', () => {
    renderLayout();
    act(() => {
      window.location.hash = '#not-a-section';
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    expect(screen.getByText('General content')).toBeDefined();
  });

  it('stops listening once unmounted', () => {
    const view = render(
      <I18nProvider locale="en">
        <SettingsLayout titleIcon={<span />} sections={SECTIONS} />
      </I18nProvider>,
    );
    view.unmount();
    act(() => {
      window.location.hash = '#privacy';
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    expect(screen.queryByText('Privacy content')).toBeNull();
  });
});

describe('search runs across every section, not within one', () => {
  it('shows every matching section at once, whatever is selected', () => {
    // The point of searching settings is that you do not know which section the setting is in.
    renderLayout();
    fireEvent.change(searchBox(), { target: { value: 'theme' } });

    expect(screen.getByText('Appearance content')).toBeDefined();
    expect(screen.queryByText('General content')).toBeNull();
  });

  it('matches diacritic-insensitively, the same way the rest of the product searches', () => {
    renderLayout({
      sections: [section('a', 'Şifreler', { searchText: 'Şifreler parolalar' }), ...SECTIONS],
    });
    fireEvent.change(searchBox(), { target: { value: 'sifreler' } });
    expect(screen.getByText('Şifreler content')).toBeDefined();
  });

  it('says so when nothing matches, instead of showing a blank pane', () => {
    renderLayout();
    fireEvent.change(searchBox(), { target: { value: 'zzz-nothing' } });
    expect(screen.getByText('No matching settings')).toBeDefined();
  });

  it('labels each result with its group, so two similarly named settings are tellable apart', () => {
    renderLayout();
    fireEvent.change(searchBox(), { target: { value: 'General' } });
    expect(screen.getByRole('button', { name: /Basics · General/ })).toBeDefined();
  });

  it('labels an ungrouped result by its own name alone', () => {
    renderLayout({ sections: [section('solo', 'Solo', { searchText: 'Solo thing' })] });
    fireEvent.change(searchBox(), { target: { value: 'Solo' } });
    // the sidebar row matches the same name, so take the one outside the nav — the result heading
    const heading = screen
      .getAllByRole('button', { name: /Solo/ })
      .find((b) => b.closest('nav') === null);
    expect(heading?.textContent?.trim()).toBe('Solo');
  });

  it('drops the current-section marking while searching, because none of them is "current"', () => {
    renderLayout();
    fireEvent.change(searchBox(), { target: { value: 'General' } });
    expect(
      within(nav())
        .getByRole('button', { name: /General/ })
        .getAttribute('aria-current'),
    ).toBe('false');
  });

  it('a result heading jumps to that section and leaves the search', () => {
    renderLayout();
    fireEvent.change(searchBox(), { target: { value: 'cookies' } });
    fireEvent.click(screen.getByRole('button', { name: /Advanced · Privacy/ }));

    expect((searchBox() as HTMLInputElement).value).toBe('');
    expect(window.location.hash).toBe('#privacy');
    expect(screen.getByText('Privacy content')).toBeDefined();
  });

  it('Escape clears the query without leaving the box', () => {
    renderLayout();
    fireEvent.change(searchBox(), { target: { value: 'theme' } });
    fireEvent.keyDown(searchBox(), { key: 'Escape' });
    expect((searchBox() as HTMLInputElement).value).toBe('');
    expect(screen.getByText('General content')).toBeDefined();
  });
});

describe('the / shortcut', () => {
  it('focuses the search box from anywhere on the page', () => {
    renderLayout();
    fireEvent.keyDown(window, { key: '/' });
    expect(document.activeElement).toBe(searchBox());
  });

  it('leaves / alone while the user is typing into a field', () => {
    // A shortcut that steals a character from a text field is worse than no shortcut.
    renderLayout({
      sections: [section('a', 'A', { content: <input aria-label="a field" /> })],
    });
    const field = screen.getByLabelText('a field');
    field.focus();
    fireEvent.keyDown(window, { key: '/' });
    expect(document.activeElement).toBe(field);
  });

  it('leaves / alone inside a contenteditable, which is a text field the tag name hides', () => {
    renderLayout({
      sections: [
        section('a', 'A', {
          content: <div contentEditable data-testid="editable" suppressContentEditableWarning />,
        }),
      ],
    });
    const editable = screen.getByTestId('editable');
    // jsdom does not implement isContentEditable — it reads false however the attribute is set — so
    // the property has to be supplied for the guard under test to see what a browser would see.
    Object.defineProperty(editable, 'isContentEditable', { value: true });
    editable.focus();
    fireEvent.keyDown(window, { key: '/' });
    expect(document.activeElement).toBe(editable);
  });

  it('leaves a modified slash to the browser', () => {
    renderLayout();
    for (const mod of ['ctrlKey', 'metaKey', 'altKey'] as const) {
      fireEvent.keyDown(window, { key: '/', [mod]: true });
      expect(document.activeElement, mod).not.toBe(searchBox());
    }
  });

  it('ignores every other key', () => {
    renderLayout();
    fireEvent.keyDown(window, { key: 'a' });
    expect(document.activeElement).not.toBe(searchBox());
  });
});

describe('host-supplied chrome', () => {
  it('renders a banner above the content, and a status beside the search box', () => {
    // The status is pinned in the header on purpose: a write confirmation that pushed the page down
    // would move the control the user just clicked, right after they clicked it.
    renderLayout({
      banner: <p>Something needs attention</p>,
      status: <span>Saved</span>,
    });
    expect(screen.getByText('Something needs attention')).toBeDefined();
    expect(screen.getByText('Saved')).toBeDefined();
  });

  it('renders without a banner or status', () => {
    renderLayout();
    expect(screen.getByText('General content')).toBeDefined();
  });

  it('survives being handed no sections at all', () => {
    renderLayout({ sections: [] });
    expect(screen.getByLabelText('Search settings')).toBeDefined();
  });
});
