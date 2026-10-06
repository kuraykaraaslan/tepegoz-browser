// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ChatWorkspace } from './ChatWorkspace';
import type { ChatAccountsSnapshot } from './types';
import { createWorkspaceHelpers, msg } from './chat-workspace-test-helpers';

afterEach(cleanup);

const { wrap, makePort } = createWorkspaceHelpers(vi, render);

describe('ChatWorkspace', () => {
  it('shows a full-surface loading state instead of a sparse empty shell while accounts are still loading', async () => {
    let resolveAccounts!: (v: ChatAccountsSnapshot) => void;
    const { port } = makePort({
      listChatAccounts: () =>
        new Promise<ChatAccountsSnapshot>((resolve) => {
          resolveAccounts = resolve;
        }),
    });
    wrap(<ChatWorkspace port={port} />);

    expect(screen.getByRole('status')).toHaveProperty('textContent', 'Loading…');
    // Neither the "no accounts" empty shell nor the normal chats tab exist yet — only the loading
    // state, so there is nothing sparse-looking on screen to flash a short layout.
    expect(screen.queryByRole('tab', { name: 'Chats' })).toBeNull();
    expect(screen.queryByText('Add a chat account to get started.')).toBeNull();

    resolveAccounts({ accounts: [], states: {} });
    await screen.findByText('Add a chat account to get started.');
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('invites adding an account while still showing the chats/contacts shell', async () => {
    const onAddAccount = vi.fn();
    const { port } = makePort({
      listChatAccounts: () => Promise.resolve({ accounts: [], states: {} }),
      listChatConversations: () => Promise.resolve([]),
      getChatRoster: () => Promise.resolve([]),
    });
    wrap(<ChatWorkspace port={port} onAddAccount={onAddAccount} />);
    await screen.findByText('Add a chat account to get started.');

    // The left column keeps its tabs and their empty lists — the surface is not replaced.
    expect(screen.getByRole('tab', { name: 'Chats' })).toBeDefined();
    expect(screen.getByRole('tab', { name: 'Contacts' })).toBeDefined();
    expect(screen.getByText('No conversations yet')).toBeDefined();
    fireEvent.click(screen.getByRole('tab', { name: 'Contacts' }));
    expect(screen.getByText('No contacts yet')).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Add account' }));
    expect(onAddAccount).toHaveBeenCalled();
  });

  it('shows an always-on left header with a gear that opens the accounts manager', async () => {
    const onAddAccount = vi.fn();
    const { port } = makePort({
      listChatAccounts: () =>
        Promise.resolve({
          accounts: [
            { id: 'work', label: 'Work', displayName: '', protocol: 'xmpp', color: null, order: 0 },
          ],
          states: { work: 'online' },
        }),
      listChatConversations: () => Promise.resolve([]),
      getChatRoster: () => Promise.resolve([]),
    });
    wrap(<ChatWorkspace port={port} onAddAccount={onAddAccount} />);
    // header present even with an account configured (no "add account" hint then)
    expect(await screen.findByText('Chat')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Accounts' }));

    // The one configured account is listed here — this is what was missing before: a single
    // account had no visible confirmation anywhere that it had actually been saved.
    expect(await screen.findByRole('heading', { name: 'Accounts' })).toBeDefined();
    expect(screen.getByText('Work')).toBeDefined();
    expect(onAddAccount).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Add account' }));
    expect(onAddAccount).toHaveBeenCalled();
  });

  it('removes an account from the accounts manager after a confirming second click', async () => {
    const removeChatAccount = vi.fn(() => Promise.resolve());
    const { port } = makePort({
      listChatAccounts: () =>
        Promise.resolve({
          accounts: [
            { id: 'work', label: 'Work', displayName: '', protocol: 'xmpp', color: null, order: 0 },
          ],
          states: { work: 'online' },
        }),
      listChatConversations: () => Promise.resolve([]),
      getChatRoster: () => Promise.resolve([]),
      removeChatAccount,
    });
    wrap(<ChatWorkspace port={port} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Accounts' }));
    await screen.findByText('Work');

    const remove = screen.getByRole('button', { name: 'Remove' });
    fireEvent.click(remove);
    expect(removeChatAccount).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Click again to remove' }));
    await waitFor(() => expect(removeChatAccount).toHaveBeenCalledWith('work'));
  });

  it('lists conversations, opens one, and renders its timeline', async () => {
    const { port } = makePort();
    wrap(<ChatWorkspace port={port} />);
    const row = await screen.findByRole('button', { name: /Bob/ });
    fireEvent.click(row);
    await screen.findByText('hi there');
    expect(screen.getByRole('heading', { name: 'Bob' })).toBeDefined();
  });

  it('wires a clicked message link through onOpenLink', async () => {
    const onOpenLink = vi.fn();
    const { port } = makePort({
      getChatHistory: () =>
        Promise.resolve({
          messages: [msg({ body: 'see https://tepegoz.example/x' })],
          nextCursor: null,
        }),
    });
    wrap(<ChatWorkspace port={port} onOpenLink={onOpenLink} />);
    fireEvent.click(await screen.findByRole('button', { name: /Bob/ }));
    const link = await screen.findByRole('link', { name: 'https://tepegoz.example/x' });
    fireEvent.click(link);
    expect(onOpenLink).toHaveBeenCalledWith('https://tepegoz.example/x');
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

  it("wires the roster panel's add-contact form to the port, for the active account", async () => {
    const addChatContact = vi.fn(() => Promise.resolve());
    const { port } = makePort({ addChatContact });
    wrap(<ChatWorkspace port={port} />);
    fireEvent.click(await screen.findByRole('tab', { name: 'Contacts' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Add contact' }), {
      target: { value: 'carol@example.org' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add contact' }));
    await waitFor(() => expect(addChatContact).toHaveBeenCalledWith('work', 'carol@example.org'));
  });

  it("wires the roster panel's remove-contact control to the port, for the active account", async () => {
    const removeChatContact = vi.fn(() => Promise.resolve());
    const { port } = makePort({ removeChatContact });
    wrap(<ChatWorkspace port={port} />);
    fireEvent.click(await screen.findByRole('tab', { name: 'Contacts' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Remove Bob' }));
    await waitFor(() => expect(removeChatContact).toHaveBeenCalledWith('work', 'bob@x.example'));
  });

  it('opening a contact never messaged before starts a real DM, not a dead end', async () => {
    const { port } = makePort({ listChatConversations: () => Promise.resolve([]) });
    wrap(<ChatWorkspace port={port} />);
    fireEvent.click(await screen.findByRole('tab', { name: 'Contacts' }));
    fireEvent.click(await screen.findByText('Bob'));
    // No prior conversation row exists yet — a stub renders (named by address, the real name arrives
    // once the first message creates a genuine row) so the composer is actually usable, rather than
    // silently landing back on "Pick a conversation." (the previous, dead-end behavior).
    expect(screen.queryByText('Pick a conversation.')).toBeNull();
    expect(screen.getByRole('heading', { name: 'bob@x.example' })).toBeDefined();
    expect(screen.getByPlaceholderText('Write a message…')).toBeDefined();
  });
});
