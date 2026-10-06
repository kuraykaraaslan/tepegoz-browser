// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ChatWorkspace } from './ChatWorkspace';
import { conv, createWorkspaceHelpers } from './chat-workspace-test-helpers';

afterEach(cleanup);

const { wrap, makePort } = createWorkspaceHelpers(vi, render);

describe('ChatWorkspace', () => {
  it('marks IRC conversations as not encrypted, in both the DM and room headers', async () => {
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
      listChatConversations: () =>
        Promise.resolve([
          conv(),
          conv({ id: '#tepegoz', kind: 'room', address: '#tepegoz', name: '#tepegoz' }),
        ]),
    });
    wrap(<ChatWorkspace port={port} />);

    fireEvent.click(await screen.findByRole('button', { name: /Bob/ }));
    await screen.findByText('hi there');
    expect(screen.getByText('Not encrypted')).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: /#tepegoz/ }));
    await waitFor(() => expect(screen.getByText('Not encrypted')).toBeDefined());
  });

  it('does not mark XMPP conversations as not encrypted', async () => {
    const { port } = makePort();
    wrap(<ChatWorkspace port={port} />);
    fireEvent.click(await screen.findByRole('button', { name: /Bob/ }));
    await screen.findByText('hi there');
    expect(screen.queryByText('Not encrypted')).toBeNull();
  });

  it('hides the reaction UI on an IRC conversation — the protocol has no reaction mechanism at all', async () => {
    const { port } = makePort({
      reactToChatMessage: vi.fn(() => Promise.resolve()),
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
    });
    wrap(<ChatWorkspace port={port} />);
    fireEvent.click(await screen.findByRole('button', { name: /Bob/ }));
    await screen.findByText('hi there');
    expect(screen.queryByRole('button', { name: 'Add reaction' })).toBeNull();
  });

  it('shows the reaction UI on an XMPP conversation when the port supports it', async () => {
    const { port } = makePort({ reactToChatMessage: vi.fn(() => Promise.resolve()) });
    wrap(<ChatWorkspace port={port} />);
    fireEvent.click(await screen.findByRole('button', { name: /Bob/ }));
    await screen.findByText('hi there');
    expect(screen.getByRole('button', { name: 'Add reaction' })).toBeDefined();
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
        change: {
          kind: 'typing',
          conversationId: 'c1',
          senderAddress: 'bob@x.example',
          active: true,
        },
      });
    });
    expect(screen.getByText('typing…')).toBeDefined();
  });

  it('mutes a conversation for a picked duration from the DM header through the port', async () => {
    const setChatMuted = vi.fn(() => Promise.resolve());
    const muteChatFor = vi.fn(() => Promise.resolve());
    const { port } = makePort({ setChatMuted, muteChatFor });
    wrap(<ChatWorkspace port={port} />);
    fireEvent.click(await screen.findByRole('button', { name: /Bob/ }));
    await screen.findByText('hi there');
    fireEvent.click(screen.getByRole('button', { name: 'Mute' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Mute for 8 hours' }));
    await waitFor(() => expect(muteChatFor).toHaveBeenCalledWith('work', 'c1', 8 * 3_600_000));
  });

  it('archives a conversation from the DM header, which then moves it off the default list', async () => {
    const setChatArchived = vi.fn(() => Promise.resolve());
    const { port } = makePort({ setChatArchived });
    wrap(<ChatWorkspace port={port} />);
    fireEvent.click(await screen.findByRole('button', { name: /Bob/ }));
    await screen.findByText('hi there');
    fireEvent.click(screen.getByRole('button', { name: 'Archive' }));
    await waitFor(() => expect(setChatArchived).toHaveBeenCalledWith('work', 'c1', true));
  });

  it('hides archived conversations from the default list; "Show archived" reveals them', async () => {
    const { port } = makePort({
      listChatConversations: () =>
        Promise.resolve([
          conv({ id: 'c1', name: 'Bob' }),
          conv({ id: 'c2', name: 'Ada', archived: true }),
        ]),
    });
    wrap(<ChatWorkspace port={port} />);
    await screen.findByText('Bob');
    expect(screen.queryByText('Ada')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Show archived/ }));
    expect(screen.queryByText('Bob')).toBeNull();
    expect(screen.getByText('Ada')).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Back to Chats' }));
    expect(screen.getByText('Bob')).toBeDefined();
    expect(screen.queryByText('Ada')).toBeNull();
  });

  it('names who is typing in a room', async () => {
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
          kind: 'typing',
          conversationId: 'room@conf',
          senderAddress: 'room@conf/Bea',
          active: true,
        },
      });
      emit({
        kind: 'change',
        accountId: 'work',
        change: {
          kind: 'typing',
          conversationId: 'room@conf',
          senderAddress: 'room@conf/Cy',
          active: true,
        },
      });
    });
    expect(screen.getByText('Bea & Cy are typing…')).toBeDefined();
  });
});
