// @vitest-environment jsdom
import type { ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { I18nProvider } from '@tepegoz/i18n/react';
import type { ChatContact, ChatConversation, ChatMessage } from '@tepegoz/shared-types';
import { ChatWorkspace } from './ChatWorkspace';
import type { ChatClientPort, ChatStateEvent } from './types';

afterEach(cleanup);

const wrap = (ui: ReactElement) => render(<I18nProvider locale="en">{ui}</I18nProvider>);

function conv(over: Partial<ChatConversation> = {}): ChatConversation {
  return {
    id: 'c1',
    accountId: 'work',
    kind: 'dm',
    address: 'bob@x.example',
    name: 'Bob',
    topic: '',
    memberCount: 2,
    unread: 0,
    mentions: 0,
    lastReadId: null,
    muted: false,
    notifyLevel: 'all',
    isKnownContact: true,
    updatedAt: 100,
    ...over,
  };
}

function msg(over: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'm1',
    conversationId: 'c1',
    accountId: 'work',
    protocolId: 'p1',
    senderAddress: 'bob@x.example',
    senderName: 'Bob',
    kind: 'text',
    body: 'hi there',
    mediaRef: null,
    replyToId: null,
    reactions: [],
    editedAt: null,
    redacted: false,
    originTs: 200,
    receivedAt: 200,
    deliveryState: 'delivered',
    ...over,
  };
}

function makePort(over: Partial<ChatClientPort> = {}): {
  port: ChatClientPort;
  emit: (e: ChatStateEvent) => void;
  sendChatMessage: ReturnType<typeof vi.fn>;
} {
  let listener: ((e: ChatStateEvent) => void) | null = null;
  const sendChatMessage = vi.fn(() => Promise.resolve({ protocolId: 's1' }));
  const port: ChatClientPort = {
    listChatAccounts: () =>
      Promise.resolve({
        accounts: [
          { id: 'work', label: 'Work', displayName: '', protocol: 'xmpp', color: null, order: 0 },
        ],
        states: { work: 'online' },
      }),
    listChatConversations: () => Promise.resolve([conv()]),
    getChatRoster: () =>
      Promise.resolve([
        {
          id: 'work:bob@x.example',
          accountId: 'work',
          address: 'bob@x.example',
          name: 'Bob',
          groups: [],
          presence: 'online',
          statusText: '',
          subscription: 'both',
        } satisfies ChatContact,
      ]),
    getChatHistory: () => Promise.resolve({ messages: [msg()], nextCursor: null }),
    sendChatMessage,
    setChatPresence: () => Promise.resolve(),
    markChatRead: () => Promise.resolve(),
    onChatState: (cb) => {
      listener = cb;
      return () => {
        listener = null;
      };
    },
    ...over,
  };
  return { port, emit: (e) => listener?.(e), sendChatMessage };
}

describe('ChatWorkspace', () => {
  it('shows the no-account state and invites adding one', async () => {
    const onAddAccount = vi.fn();
    const { port } = makePort({
      listChatAccounts: () => Promise.resolve({ accounts: [], states: {} }),
    });
    wrap(<ChatWorkspace port={port} onAddAccount={onAddAccount} />);
    await screen.findByText('Add a chat account to get started.');
    fireEvent.click(screen.getByRole('button', { name: 'Add account' }));
    expect(onAddAccount).toHaveBeenCalled();
  });

  it('lists conversations, opens one, and renders its timeline', async () => {
    const { port } = makePort();
    wrap(<ChatWorkspace port={port} />);
    const row = await screen.findByRole('button', { name: /Bob/ });
    fireEvent.click(row);
    await screen.findByText('hi there');
    expect(screen.getByRole('heading', { name: 'Bob' })).toBeDefined();
  });

  it('sends from the composer through the port', async () => {
    const { port, sendChatMessage } = makePort();
    wrap(<ChatWorkspace port={port} />);
    fireEvent.click(await screen.findByRole('button', { name: /Bob/ }));
    await screen.findByText('hi there');
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'yo' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() =>
      expect(sendChatMessage).toHaveBeenCalledWith('work', 'c1', {
        body: 'yo',
        replyToId: null,
        mediaPath: null,
      }),
    );
  });

  it('switches to the contacts tab and opens a conversation from a contact', async () => {
    const { port } = makePort();
    wrap(<ChatWorkspace port={port} />);
    await screen.findByRole('button', { name: /Bob/ });
    fireEvent.click(screen.getByRole('tab', { name: 'Contacts' }));
    fireEvent.click(await screen.findByText('Bob'));
    await screen.findByText('hi there');
  });

  it('renders an account switcher with more than one account and switches on click', async () => {
    const { port } = makePort({
      listChatAccounts: () =>
        Promise.resolve({
          accounts: [
            { id: 'work', label: 'Work', displayName: '', protocol: 'xmpp', color: null, order: 0 },
            { id: 'home', label: 'Home', displayName: '', protocol: 'xmpp', color: null, order: 1 },
          ],
          states: { work: 'online', home: 'error' },
        }),
    });
    wrap(<ChatWorkspace port={port} />);
    const homeTab = await screen.findByRole('tab', { name: 'Home' });
    fireEvent.click(homeTab);
    await waitFor(() => expect(homeTab.getAttribute('aria-selected')).toBe('true'));
  });

  it('opening a contact with no existing conversation does not crash', async () => {
    const { port } = makePort({ listChatConversations: () => Promise.resolve([]) });
    wrap(<ChatWorkspace port={port} />);
    fireEvent.click(await screen.findByRole('tab', { name: 'Contacts' }));
    fireEvent.click(await screen.findByText('Bob'));
    expect(screen.getByText('Pick a conversation.')).toBeDefined();
  });

  it('renders a room header + toggles the member list for a room conversation', async () => {
    const { port, emit } = makePort({
      listChatConversations: () =>
        Promise.resolve([conv({ id: 'room@conf', kind: 'room', address: 'room@conf', name: 'Room', topic: 'Weekly' })]),
    });
    wrap(<ChatWorkspace port={port} />);
    fireEvent.click(await screen.findByRole('button', { name: /Room/ }));
    await screen.findByText('hi there');

    // stored topic shows until a live subject / occupants arrive
    expect(screen.getByText('Weekly')).toBeDefined();

    act(() => {
      emit({
        kind: 'change',
        accountId: 'work',
        change: {
          kind: 'room',
          conversationId: 'room@conf',
          room: {
            joined: true,
            selfNick: 'me',
            subject: 'Weekly',
            occupants: {
              Bea: { nick: 'Bea', realJid: null, affiliation: 'member', role: 'participant', presence: 'online', statusText: '' },
            },
          },
        },
      } as never);
    });

    const toggle = screen.getByRole('button', { name: '1 Members' });
    expect(screen.queryByText('Bea')).toBeNull();
    fireEvent.click(toggle);
    expect(screen.getByText('Bea')).toBeDefined();
  });

  it('shows a Rooms tab only when the port supports MUC, and joins from it', async () => {
    const plain = makePort();
    wrap(<ChatWorkspace port={plain.port} />);
    await screen.findByRole('button', { name: /Bob/ });
    expect(screen.queryByRole('tab', { name: 'Find a room' })).toBeNull();
    cleanup();

    const joinChatRoom = vi.fn(() => Promise.resolve());
    const { port } = makePort({
      discoverChatRooms: () =>
        Promise.resolve([
          {
            jid: 'general@conf.example',
            name: 'General',
            description: null,
            occupants: 4,
            passwordProtected: false,
            membersOnly: false,
          },
        ]),
      joinChatRoom,
    });
    wrap(<ChatWorkspace port={port} />);
    fireEvent.click(await screen.findByRole('tab', { name: 'Find a room' }));
    fireEvent.change(screen.getByLabelText('Room service'), { target: { value: 'conf.example' } });
    fireEvent.click(screen.getByRole('button', { name: 'Browse' }));
    fireEvent.click(await screen.findByText('General'));
    await waitFor(() => expect(joinChatRoom).toHaveBeenCalledWith('work', 'general@conf.example'));
  });

  it('reflects a pushed typing change in the conversation header', async () => {
    const { port, emit } = makePort();
    wrap(<ChatWorkspace port={port} />);
    fireEvent.click(await screen.findByRole('button', { name: /Bob/ }));
    await screen.findByText('hi there');
    act(() => {
      emit({
        kind: 'change',
        accountId: 'work',
        change: { kind: 'typing', conversationId: 'c1', senderAddress: 'bob@x.example', active: true },
      });
    });
    expect(screen.getByText('typing…')).toBeDefined();
  });
});
