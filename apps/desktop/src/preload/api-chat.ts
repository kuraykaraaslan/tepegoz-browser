import { ipcRenderer } from 'electron';
import {
  IpcChannels,
  type ChatAccount,
  type ChatAccountsSnapshot,
  type ChatContact,
  type ChatConversation,
  type ChatHistoryPage,
  type ChatPresence,
  type ChatRoomSummary,
  type ChatStateEvent,
  type OutgoingMessage,
  type TepegozApi,
} from '@tepegoz/desktop-ipc';
import { invoke } from './ipc-invoke';

/**
 * Multi-protocol messenger (`com.tepegoz.chat`, X-chat.1) bridge methods. The renderer names accounts
 * and conversations by id; sockets, SASL secrets and stream handles stay in main. A credential crosses
 * exactly once, in `addChatAccount`, and is stored in the OS keychain — never echoed back.
 */
export const chatApi: Pick<
  TepegozApi,
  | 'listChatAccounts'
  | 'addChatAccount'
  | 'removeChatAccount'
  | 'listChatConversations'
  | 'getChatRoster'
  | 'getChatHistory'
  | 'sendChatMessage'
  | 'setChatPresence'
  | 'markChatRead'
  | 'discoverChatRooms'
  | 'joinChatRoom'
  | 'onChatState'
> = {
  listChatAccounts: () => invoke<ChatAccountsSnapshot>(IpcChannels.chatListAccounts),
  addChatAccount: (account: ChatAccount, secret: string) =>
    invoke<void>(IpcChannels.chatAddAccount, { account, secret }),
  removeChatAccount: (accountId: string) =>
    invoke<void>(IpcChannels.chatRemoveAccount, { accountId }),
  listChatConversations: (accountId?: string) =>
    invoke<ChatConversation[]>(IpcChannels.chatListConversations, accountId),
  getChatRoster: (accountId: string) =>
    invoke<ChatContact[]>(IpcChannels.chatGetRoster, { accountId }),
  getChatHistory: (accountId: string, conversationId: string, before?: string | null) =>
    invoke<ChatHistoryPage>(IpcChannels.chatGetHistory, {
      accountId,
      conversationId,
      before: before ?? null,
    }),
  sendChatMessage: (accountId: string, conversationId: string, body: OutgoingMessage) =>
    invoke<{ protocolId: string }>(IpcChannels.chatSendMessage, { accountId, conversationId, body }),
  setChatPresence: (accountId: string, presence: ChatPresence, statusText?: string) =>
    invoke<void>(IpcChannels.chatSetPresence, {
      accountId,
      presence,
      ...(statusText !== undefined ? { statusText } : {}),
    }),
  markChatRead: (accountId: string, conversationId: string, protocolId: string) =>
    invoke<void>(IpcChannels.chatMarkRead, { accountId, conversationId, protocolId }),
  discoverChatRooms: (accountId: string, service: string) =>
    invoke<ChatRoomSummary[]>(IpcChannels.chatDiscoverRooms, { accountId, service }),
  joinChatRoom: (accountId: string, roomJid: string) =>
    invoke<void>(IpcChannels.chatJoinRoom, { accountId, roomJid }),
  onChatState: (callback: (event: ChatStateEvent) => void) => {
    const listener = (_event: unknown, payload: ChatStateEvent): void => {
      callback(payload);
    };
    ipcRenderer.on(IpcChannels.chatState, listener);
    return () => {
      ipcRenderer.removeListener(IpcChannels.chatState, listener);
    };
  },
};
