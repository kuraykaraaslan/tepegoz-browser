// @vitest-environment jsdom
import type { ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { I18nProvider } from '@tepegoz/i18n/react';
import type { ChatContact, ChatConversation } from '@tepegoz/shared-types';
import { NewChatDialog } from './NewChatDialog';

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
    blocked: false,
    ...over,
  };
}

function room(over: Partial<ChatConversation> = {}): ChatConversation {
  return {
    id: 'general@conf.example',
    accountId: 'work',
    kind: 'room',
    address: 'general@conf.example',
    name: 'General',
    topic: '',
    memberCount: 3,
    unread: 0,
    mentions: 0,
    lastReadId: null,
    muted: false,
    mutedUntil: null,
    notifyLevel: 'all',
    isKnownContact: false,
    archived: false,
    lastMessage: null,
    updatedAt: 100,
    ...over,
  };
}

describe('NewChatDialog', () => {
  it('closes on backdrop click and on Escape', () => {
    const onClose = vi.fn();
    wrap(
      <NewChatDialog
        contacts={[]}
        accounts={[]}
        joinedRooms={[]}
        onOpenContact={vi.fn()}
        onOpenRoom={vi.fn()}
        onStartByAddress={vi.fn()}
        onClose={onClose}
      />,
    );
    fireEvent.click(screen.getByRole('dialog').parentElement as HTMLElement);
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('does not close when clicking inside the dialog itself', () => {
    const onClose = vi.fn();
    wrap(
      <NewChatDialog
        contacts={[]}
        accounts={[]}
        joinedRooms={[]}
        onOpenContact={vi.fn()}
        onOpenRoom={vi.fn()}
        onStartByAddress={vi.fn()}
        onClose={onClose}
      />,
    );
    fireEvent.click(screen.getByRole('dialog'));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('opens a contact and closes, filtered by search', () => {
    const onOpenContact = vi.fn<(c: ChatContact) => void>();
    const onClose = vi.fn();
    wrap(
      <NewChatDialog
        contacts={[
          contact({ id: 'a', name: 'Ada', accountId: 'work' }),
          contact({ id: 'b', name: 'Bea', accountId: 'home' }),
        ]}
        accounts={[
          { id: 'work', label: 'Work', protocol: 'xmpp' },
          { id: 'home', label: 'Home', protocol: 'irc' },
        ]}
        joinedRooms={[]}
        onOpenContact={onOpenContact}
        onOpenRoom={vi.fn()}
        onStartByAddress={vi.fn()}
        onClose={onClose}
      />,
    );
    fireEvent.change(screen.getByLabelText('Search contacts'), { target: { value: 'ada' } });
    expect(screen.getByText('Ada')).toBeDefined();
    expect(screen.queryByText('Bea')).toBeNull();
    // Each contact row is captioned with its own account — disambiguation for a name that collides
    // across accounts.
    expect(screen.getByText('Work')).toBeDefined();

    fireEvent.click(screen.getByText('Ada'));
    expect(onOpenContact).toHaveBeenCalledWith(expect.objectContaining({ id: 'a' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('opens an already-joined room, captioned by its account for name-collision disambiguation', () => {
    const onOpenRoom = vi.fn<(c: ChatConversation) => void>();
    const onClose = vi.fn();
    wrap(
      <NewChatDialog
        contacts={[]}
        accounts={[
          { id: 'work', label: 'Work', protocol: 'xmpp' },
          { id: 'home', label: 'Home', protocol: 'xmpp' },
        ]}
        joinedRooms={[
          room({ id: 'general@a.example', accountId: 'work', name: 'General' }),
          room({ id: 'general@b.example', accountId: 'home', name: 'General' }),
        ]}
        onOpenContact={vi.fn()}
        onOpenRoom={onOpenRoom}
        onStartByAddress={vi.fn()}
        onClose={onClose}
      />,
    );
    fireEvent.click(screen.getByRole('tab', { name: 'Rooms' }));
    const generals = screen.getAllByText('General');
    expect(generals).toHaveLength(2);
    expect(screen.getByText('Work')).toBeDefined();
    expect(screen.getByText('Home')).toBeDefined();

    fireEvent.click(generals[0] as HTMLElement);
    expect(onOpenRoom).toHaveBeenCalledWith(expect.objectContaining({ id: 'general@a.example' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('filters joined rooms via search and shows the empty state', () => {
    wrap(
      <NewChatDialog
        contacts={[]}
        accounts={[{ id: 'work', label: 'Work', protocol: 'xmpp' }]}
        joinedRooms={[room({ id: 'a', name: 'General' }), room({ id: 'b', name: 'Random' })]}
        onOpenContact={vi.fn()}
        onOpenRoom={vi.fn()}
        onStartByAddress={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('tab', { name: 'Rooms' }));
    fireEvent.change(screen.getByLabelText('Search your rooms'), { target: { value: 'zzz' } });
    expect(screen.getByText("You haven't joined any rooms yet.")).toBeDefined();
  });

  it('shows the discovery-unavailable note when no discovery callbacks are given', () => {
    wrap(
      <NewChatDialog
        contacts={[]}
        accounts={[{ id: 'work', label: 'Work', protocol: 'xmpp' }]}
        joinedRooms={[]}
        onOpenContact={vi.fn()}
        onOpenRoom={vi.fn()}
        onStartByAddress={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('tab', { name: 'Rooms' }));
    expect(screen.getByText(/no account here can browse/i)).toBeDefined();
  });

  it('starts a chat by raw address under the picked account', () => {
    const onStartByAddress = vi.fn<(accountId: string, address: string) => void>();
    const onClose = vi.fn();
    wrap(
      <NewChatDialog
        contacts={[]}
        accounts={[
          { id: 'work', label: 'Work', protocol: 'xmpp' },
          { id: 'home', label: 'Home', protocol: 'irc' },
        ]}
        joinedRooms={[]}
        onOpenContact={vi.fn()}
        onOpenRoom={vi.fn()}
        onStartByAddress={onStartByAddress}
        onClose={onClose}
      />,
    );
    fireEvent.click(screen.getByRole('tab', { name: 'By address' }));
    fireEvent.change(screen.getByLabelText('Account'), { target: { value: 'home' } });
    fireEvent.change(screen.getByLabelText('Address'), { target: { value: 'carol@x.example' } });
    fireEvent.click(screen.getByRole('button', { name: 'Start chat' }));
    expect(onStartByAddress).toHaveBeenCalledWith('home', 'carol@x.example');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('disables the Start button until an address is entered', () => {
    wrap(
      <NewChatDialog
        contacts={[]}
        accounts={[{ id: 'work', label: 'Work', protocol: 'xmpp' }]}
        joinedRooms={[]}
        onOpenContact={vi.fn()}
        onOpenRoom={vi.fn()}
        onStartByAddress={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('tab', { name: 'By address' }));
    expect(screen.getByRole('button', { name: 'Start chat' })).toHaveProperty('disabled', true);
    fireEvent.change(screen.getByLabelText('Address'), { target: { value: 'carol@x.example' } });
    expect(screen.getByRole('button', { name: 'Start chat' })).toHaveProperty('disabled', false);
  });
});
