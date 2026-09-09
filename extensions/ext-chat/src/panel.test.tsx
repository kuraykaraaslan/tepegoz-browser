// @vitest-environment jsdom
import type { ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { I18nProvider } from '@tepegoz/i18n/react';
import type { ChatContact } from '@tepegoz/shared-types';
import { ChatPage, ChatSidebar, type ChatHostApi } from './panel';

afterEach(cleanup);

const wrap = (ui: ReactElement) => render(<I18nProvider locale="en">{ui}</I18nProvider>);

function fakeApi(over: Partial<ChatHostApi> = {}): ChatHostApi {
  return {
    listChatAccounts: () => Promise.resolve({ accounts: [], states: {} }),
    listChatConversations: () => Promise.resolve([]),
    getChatRoster: () => Promise.resolve([] as ChatContact[]),
    getChatHistory: () => Promise.resolve({ messages: [], nextCursor: null }),
    sendChatMessage: () => Promise.resolve({ protocolId: 'p' }),
    setChatPresence: () => Promise.resolve(),
    markChatRead: () => Promise.resolve(),
    onChatState: () => () => {},
    addChatAccount: vi.fn(() => Promise.resolve()),
    ...over,
  };
}

describe('ext-chat panel', () => {
  it('renders the workspace no-account state and both surfaces use it', async () => {
    wrap(<ChatSidebar api={fakeApi()} onClose={vi.fn()} />);
    await screen.findByText('Add a chat account to get started.');
    cleanup();
    wrap(<ChatPage api={fakeApi()} onClose={vi.fn()} />);
    await screen.findByText('Add a chat account to get started.');
  });

  it('swaps in the setup form and forwards a completed account (secretRef + meta filled)', async () => {
    const addChatAccount = vi.fn<ChatHostApi['addChatAccount']>(() => Promise.resolve());
    wrap(<ChatPage api={fakeApi({ addChatAccount })} onClose={vi.fn()} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Add contact' }));
    fireEvent.change(await screen.findByLabelText('Account name'), { target: { value: 'Work' } });
    fireEvent.change(screen.getByLabelText('Jabber ID (JID)'), { target: { value: 'ada@x.org' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'pencil' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add account' }));

    await vi.waitFor(() => expect(addChatAccount).toHaveBeenCalledTimes(1));
    const [account, secret] = addChatAccount.mock.calls[0] ?? [];
    expect(account).toMatchObject({ id: 'work', secretRef: 'chat:work', version: 1 });
    expect(secret).toBe('pencil');
  });

  it('cancels back out of the setup form', async () => {
    wrap(<ChatSidebar api={fakeApi()} onClose={vi.fn()} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Add contact' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }));
    await screen.findByText('Add a chat account to get started.');
  });
});
