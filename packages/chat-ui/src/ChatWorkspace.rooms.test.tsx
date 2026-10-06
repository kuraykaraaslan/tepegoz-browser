// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ChatWorkspace } from './ChatWorkspace';
import { conv, createWorkspaceHelpers, msg } from './chat-workspace-test-helpers';

afterEach(cleanup);

const { wrap, makePort } = createWorkspaceHelpers(vi, render);

describe('ChatWorkspace', () => {
  it('renders a room header + toggles the member list for a room conversation', async () => {
    const { port, emit } = makePort({
      listChatConversations: () =>
        Promise.resolve([
          conv({
            id: 'room@conf',
            kind: 'room',
            address: 'room@conf',
            name: 'Room',
            topic: 'Weekly',
          }),
        ]),
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
              Bea: {
                nick: 'Bea',
                realJid: null,
                affiliation: 'member',
                role: 'participant',
                presence: 'online',
                statusText: '',
              },
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

  it('clicking a room member starts a DM with them (nick as the address, when no real JID)', async () => {
    const { port, emit } = makePort({
      listChatConversations: () =>
        Promise.resolve([
          conv({ id: 'room@conf', kind: 'room', address: 'room@conf', name: 'Room' }),
        ]),
    });
    wrap(<ChatWorkspace port={port} />);
    fireEvent.click(await screen.findByRole('button', { name: /Room/ }));
    await screen.findByText('hi there');
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
            subject: '',
            occupants: {
              Bea: {
                nick: 'Bea',
                realJid: null,
                affiliation: 'member',
                role: 'participant',
                presence: 'online',
                statusText: '',
              },
            },
          },
        },
      } as never);
    });
    fireEvent.click(screen.getByRole('button', { name: '1 Members' }));
    fireEvent.click(screen.getByText('Bea'));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Bea' })).toBeDefined());
  });

  it('clicking yourself in the room member list does nothing', async () => {
    const { port, emit } = makePort({
      listChatConversations: () =>
        Promise.resolve([
          conv({ id: 'room@conf', kind: 'room', address: 'room@conf', name: 'Room' }),
        ]),
    });
    wrap(<ChatWorkspace port={port} />);
    fireEvent.click(await screen.findByRole('button', { name: /Room/ }));
    await screen.findByText('hi there');
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
            subject: '',
            occupants: {
              me: {
                nick: 'me',
                realJid: null,
                affiliation: 'member',
                role: 'participant',
                presence: 'online',
                statusText: '',
              },
            },
          },
        },
      } as never);
    });
    fireEvent.click(screen.getByRole('button', { name: '1 Members' }));
    fireEvent.click(screen.getByText('me'));
    expect(screen.getByRole('heading', { name: 'Room' })).toBeDefined();
  });

  it("recognises the local user's own room messages by occupant nick, not by address equality", async () => {
    const { port, emit } = makePort({
      listChatConversations: () =>
        Promise.resolve([
          conv({ id: 'room@conf', kind: 'room', address: 'room@conf', name: 'Room' }),
        ]),
      getChatHistory: () =>
        Promise.resolve({
          messages: [
            msg({ id: 'm1', protocolId: 'p1', senderAddress: 'room@conf/Bea', body: 'their line' }),
            msg({ id: 'm2', protocolId: 'p2', senderAddress: 'room@conf/me', body: 'my line' }),
          ],
          nextCursor: null,
        }),
    });
    wrap(<ChatWorkspace port={port} />);
    fireEvent.click(await screen.findByRole('button', { name: /Room/ }));
    await screen.findByText('their line');

    act(() => {
      emit({
        kind: 'change',
        accountId: 'work',
        change: {
          kind: 'room',
          conversationId: 'room@conf',
          room: { joined: true, selfNick: 'me', subject: '', occupants: {} },
        },
      } as never);
    });

    await waitFor(() =>
      expect(screen.getByText('my line').closest('.chat-msg')?.getAttribute('data-own')).toBe(
        'true',
      ),
    );
    expect(screen.getByText('their line').closest('.chat-msg')?.getAttribute('data-own')).toBe(
      'false',
    );
  });

  it("the New Chat dialog's Rooms tab discovers only when the port supports MUC, and joins from it", async () => {
    const plain = makePort();
    wrap(<ChatWorkspace port={plain.port} />);
    await screen.findByRole('button', { name: /Bob/ });
    fireEvent.click(screen.getByRole('button', { name: 'New chat' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Rooms' }));
    // The plain port supports no rooms at all — `chat.rooms` is null, so no discovery UI at all.
    expect(screen.getByText(/no account here can browse/i)).toBeDefined();
    cleanup();

    let joined = false;
    const joinChatRoom = vi.fn((): Promise<string | null> => {
      joined = true;
      return Promise.resolve('general@conf.example');
    });
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
      listChatConversations: () =>
        Promise.resolve(
          joined
            ? [conv(), conv({ id: 'general@conf.example', kind: 'room', name: 'General' })]
            : [conv()],
        ),
    });
    wrap(<ChatWorkspace port={port} />);
    fireEvent.click(await screen.findByRole('button', { name: 'New chat' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Rooms' }));
    fireEvent.change(screen.getByLabelText('Room service'), { target: { value: 'conf.example' } });
    fireEvent.click(screen.getByRole('button', { name: 'Browse' }));
    fireEvent.click(await screen.findByText('General'));
    await waitFor(() => expect(joinChatRoom).toHaveBeenCalledWith('work', 'general@conf.example'));
    // Joining must actually open the room, not just close the dialog (the original reported bug: the
    // panel flipped tabs but the conversation never appeared because its row was never re-seeded).
    await waitFor(() => expect(screen.getByRole('heading', { name: 'General' })).toBeDefined());
  });

  it('a failed join keeps the New Chat dialog open with a visible error, instead of closing onto an empty Chats pane', async () => {
    const joinChatRoom = vi.fn(() => Promise.reject(new Error('not connected')));
    const { port } = makePort({
      discoverChatRooms: () => Promise.resolve([]),
      joinChatRoom,
    });
    wrap(<ChatWorkspace port={port} />);
    fireEvent.click(await screen.findByRole('button', { name: 'New chat' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Rooms' }));

    const input = screen.getByLabelText('Join by address');
    fireEvent.change(input, { target: { value: '#test' } });
    fireEvent.click(screen.getByRole('button', { name: 'Join' }));

    await screen.findByRole('alert');
    // Still open — this is the reported bug: joining used to switch to the Chats tab
    // unconditionally, so a failed join (e.g. the account not connected yet) landed on an empty
    // pane with no room and no visible reason why.
    expect(screen.getByRole('dialog', { name: 'New chat' })).toBeDefined();
  });

  it('an IRC account hides room browsing (no directory) but can still join a channel by address', async () => {
    const joinChatRoom = vi.fn((): Promise<string | null> => Promise.resolve('#tepegoz'));
    const { port } = makePort({
      listChatAccounts: () =>
        Promise.resolve({
          accounts: [
            {
              id: 'work',
              label: 'Libera',
              displayName: '',
              protocol: 'irc',
              color: null,
              order: 0,
            },
          ],
          states: { work: 'online' },
        }),
      // IRC has joinRoom but no discoverRooms — the port still exposes both callbacks (a generic
      // desktop bridge, not an adapter-specific one), so the Rooms tab's discovery section shows;
      // only the protocol tells the UI discovery itself is unsupported.
      discoverChatRooms: vi.fn(),
      joinChatRoom,
    });
    wrap(<ChatWorkspace port={port} />);
    fireEvent.click(await screen.findByRole('button', { name: 'New chat' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Rooms' }));

    expect(screen.queryByRole('button', { name: 'Browse' })).toBeNull();
    expect(screen.getByText(/no room directory/i)).toBeDefined();

    const input = screen.getByLabelText('Join by address');
    expect(input).toHaveProperty('placeholder', '#channel');
    fireEvent.change(input, { target: { value: '#tepegoz' } });
    fireEvent.click(screen.getByRole('button', { name: 'Join' }));
    await waitFor(() => expect(joinChatRoom).toHaveBeenCalledWith('work', '#tepegoz'));
  });
});
