// @vitest-environment jsdom
import type { ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { I18nProvider } from '@tepegoz/i18n/react';
import type { ChatContact } from '@tepegoz/shared-types';
import { RosterPanel } from './RosterPanel';

afterEach(cleanup);

const wrap = (ui: ReactElement) => render(<I18nProvider locale="en">{ui}</I18nProvider>);

function contact(over: Partial<ChatContact> = {}): ChatContact {
  return {
    id: 'work:bob@x.example',
    accountId: 'work',
    address: 'bob@x.example',
    name: 'Bob',
    groups: [],
    presence: 'online',
    statusText: '',
    subscription: 'both',
    ...over,
  };
}

describe('RosterPanel', () => {
  it('shows the empty state with no contacts', () => {
    wrap(<RosterPanel contacts={[]} onOpenContact={vi.fn()} />);
    expect(screen.getByText('No contacts yet')).toBeDefined();
  });

  it('groups contacts and opens one on click', () => {
    const onOpenContact = vi.fn<(c: ChatContact) => void>();
    wrap(
      <RosterPanel
        contacts={[
          contact({ id: 'a', name: 'Ada', groups: ['Work'] }),
          contact({ id: 'b', name: 'Bea', groups: [] }),
        ]}
        onOpenContact={onOpenContact}
      />,
    );
    expect(screen.getByRole('heading', { name: /Work/ })).toBeDefined();
    expect(screen.getByRole('heading', { name: /Other contacts/ })).toBeDefined();
    fireEvent.click(screen.getByText('Ada'));
    expect(onOpenContact).toHaveBeenCalledWith(expect.objectContaining({ id: 'a' }));
  });

  it('filters via the search box and shows the no-match line', () => {
    wrap(
      <RosterPanel
        contacts={[contact({ id: 'a', name: 'Ada' }), contact({ id: 'b', name: 'Bea' })]}
        onOpenContact={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'ada' } });
    expect(screen.getByText('Ada')).toBeDefined();
    expect(screen.queryByText('Bea')).toBeNull();
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'zzz' } });
    expect(screen.getByText('No contacts match your search.')).toBeDefined();
  });

  it('adds a contact and clears the field', () => {
    const onAddContact = vi.fn<(accountId: string, address: string) => void>();
    wrap(
      <RosterPanel
        contacts={[]}
        accounts={[{ id: 'work', label: 'Work' }]}
        onOpenContact={vi.fn()}
        onAddContact={onAddContact}
      />,
    );
    const input = screen.getByLabelText('Add contact');
    fireEvent.change(input, { target: { value: '  carol@x.example  ' } });
    fireEvent.submit(input.closest('form') as HTMLFormElement);
    expect(onAddContact).toHaveBeenCalledWith('work', 'carol@x.example');
    expect(input).toHaveProperty('value', '');
  });

  it('shows an account picker only when there is more than one account, and adds to the picked one', () => {
    const onAddContact = vi.fn<(accountId: string, address: string) => void>();
    wrap(
      <RosterPanel
        contacts={[]}
        accounts={[
          { id: 'work', label: 'Work' },
          { id: 'home', label: 'Home' },
        ]}
        onOpenContact={vi.fn()}
        onAddContact={onAddContact}
      />,
    );
    fireEvent.change(screen.getByLabelText('Add to account'), { target: { value: 'home' } });
    fireEvent.change(screen.getByLabelText('Add contact'), { target: { value: 'dave@x.example' } });
    fireEvent.submit(screen.getByLabelText('Add contact').closest('form') as HTMLFormElement);
    expect(onAddContact).toHaveBeenCalledWith('home', 'dave@x.example');
  });

  it('removes a contact through the per-row control', () => {
    const onRemoveContact = vi.fn<(c: ChatContact) => void>();
    wrap(
      <RosterPanel
        contacts={[contact({ id: 'a', name: 'Ada' })]}
        onOpenContact={vi.fn()}
        onRemoveContact={onRemoveContact}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Remove Ada' }));
    expect(onRemoveContact).toHaveBeenCalledWith(expect.objectContaining({ id: 'a' }));
  });

  it('marks a one-way (from) subscription as pending', () => {
    wrap(
      <RosterPanel
        contacts={[contact({ id: 'a', name: 'Ada', subscription: 'from' })]}
        onOpenContact={vi.fn()}
      />,
    );
    const row = screen.getByText('Ada').closest('button') as HTMLElement;
    expect(within(row).getByText('Awaiting response')).toBeDefined();
  });

  it("badges each contact with its own account's protocol — the unified, cross-account roster", () => {
    wrap(
      <RosterPanel
        contacts={[
          contact({ id: 'a', name: 'Ada', accountId: 'work' }),
          contact({ id: 'b', name: 'Bob', accountId: 'home' }),
        ]}
        accounts={[
          { id: 'work', label: 'Work', protocol: 'xmpp' },
          { id: 'home', label: 'Home', protocol: 'irc' },
        ]}
        onOpenContact={vi.fn()}
      />,
    );
    const ada = screen.getByText('Ada').closest('button') as HTMLElement;
    const bob = screen.getByText('Bob').closest('button') as HTMLElement;
    expect(within(ada).getByText('XMPP', { exact: false })).toBeDefined();
    expect(within(bob).getByText('IRC', { exact: false })).toBeDefined();
  });
});
