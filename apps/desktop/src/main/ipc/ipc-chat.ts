import { z } from 'zod';
import { IpcChannels } from '@tepegoz/desktop-ipc';
import type { ChatContact, ChatConversation, ChatMessage } from '@tepegoz/shared-types';
import {
  ChatAccountIdArgSchema,
  ChatAddAccountSchema,
  ChatDiscoverRoomsSchema,
  ChatGetHistorySchema,
  ChatJoinRoomSchema,
  ChatLeaveRoomSchema,
  ChatMarkReadSchema,
  ChatReactSchema,
  ChatResolveMediaSchema,
  ChatSendMessageSchema,
  ChatSetPresenceSchema,
  ChatSetRoomNotifyLevelSchema,
  ChatSetMutedSchema,
  ChatSetRoomTopicSchema,
  ChatInviteToRoomSchema,
} from '@tepegoz/desktop-ipc/schemas';
import { handle, handleAsync } from './ipc-helpers';

/**
 * `chat:*` IPC surface — the renderer's window onto the main-process `ChatService`. Every payload is
 * `safeParse`d against `schemas-chat` before it reaches the service (a bad id / an over-long secret /
 * a huge message body all throw with no service call), and `handle`/`handleAsync` map any thrown
 * value to a clean `{ message, statusCode }` so raw zod / internal text never crosses to the
 * untrusted renderer.
 *
 * The service is injected (not imported) so this module has no Electron / DB dependency and is unit
 * tested directly; `chat-service.electron.ts`'s bootstrap passes the real singleton.
 */

const AccountIdSchema = z.string().min(1).max(64);
const OptionalAccountIdSchema = AccountIdSchema.optional();

/** The slice of `ChatService` (+ store reads) the IPC layer needs. */
export interface ChatIpcService {
  listAccounts: () => ReadonlyArray<{
    id: string;
    label: string;
    displayName: string;
    protocol: string;
    color: string | null;
    order: number;
  }>;
  accountStates: () => Record<string, string>;
  addAccount: (accountId: string, plainSecret: string, account: unknown) => Promise<void>;
  removeAccount: (accountId: string) => Promise<void>;
  listConversations: (accountId?: string) => ChatConversation[];
  getRoster: (accountId: string) => ChatContact[];
  getHistory: (
    accountId: string,
    conversationId: string,
    before: string | null,
  ) => Promise<{ messages: ChatMessage[]; nextCursor: string | null }>;
  sendMessage: (
    accountId: string,
    conversationId: string,
    body: { body: string; replyToId?: string | null; mediaPath?: string | null },
  ) => Promise<string>;
  setPresence: (
    accountId: string,
    presence: 'online' | 'away' | 'xa' | 'dnd' | 'offline',
    statusText?: string,
  ) => Promise<void>;
  markRead: (accountId: string, conversationId: string, protocolId: string) => Promise<void>;
  discoverRooms: (
    accountId: string,
    service: string,
  ) => Promise<
    ReadonlyArray<{
      jid: string;
      name: string | null;
      description: string | null;
      occupants: number | null;
      passwordProtected: boolean;
      membersOnly: boolean;
    }>
  >;
  joinRoom: (accountId: string, roomJid: string) => Promise<string | null>;
  leaveRoom: (accountId: string, conversationId: string) => Promise<void>;
  setRoomNotifyLevel: (
    accountId: string,
    conversationId: string,
    level: 'all' | 'mentions' | 'none',
  ) => Promise<void>;
  setMuted: (accountId: string, conversationId: string, muted: boolean) => Promise<void>;
  setRoomTopic: (accountId: string, conversationId: string, topic: string) => Promise<void>;
  inviteToRoom: (accountId: string, conversationId: string, invitee: string) => Promise<void>;
  resolveMedia: (accountId: string, mediaRef: string) => Promise<{ dataUrl: string } | null>;
  react: (
    accountId: string,
    conversationId: string,
    messageId: string,
    emoji: string,
    on: boolean,
  ) => Promise<void>;
}

export function registerChatIpc(service: ChatIpcService): void {
  handle(IpcChannels.chatListAccounts, () => ({
    accounts: service.listAccounts(),
    states: service.accountStates(),
  }));

  handleAsync(IpcChannels.chatAddAccount, async (_event, payload): Promise<void> => {
    const { account, secret } = ChatAddAccountSchema.parse(payload);
    await service.addAccount(account.id, secret, account);
  });

  handleAsync(IpcChannels.chatRemoveAccount, async (_event, payload): Promise<void> => {
    await service.removeAccount(ChatAccountIdArgSchema.parse(payload).accountId);
  });

  handle(IpcChannels.chatListConversations, (_event, payload): ChatConversation[] =>
    service.listConversations(OptionalAccountIdSchema.parse(payload) ?? undefined),
  );

  handle(IpcChannels.chatGetRoster, (_event, payload): ChatContact[] =>
    service.getRoster(ChatAccountIdArgSchema.parse(payload).accountId),
  );

  handleAsync(IpcChannels.chatGetHistory, async (_event, payload) => {
    const { accountId, conversationId, before } = ChatGetHistorySchema.parse(payload);
    return service.getHistory(accountId, conversationId, before);
  });

  handleAsync(IpcChannels.chatSendMessage, async (_event, payload): Promise<{ protocolId: string }> => {
    const { accountId, conversationId, body } = ChatSendMessageSchema.parse(payload);
    const protocolId = await service.sendMessage(accountId, conversationId, body);
    return { protocolId };
  });

  handleAsync(IpcChannels.chatSetPresence, async (_event, payload): Promise<void> => {
    const { accountId, presence, statusText } = ChatSetPresenceSchema.parse(payload);
    await service.setPresence(accountId, presence, statusText);
  });

  handleAsync(IpcChannels.chatMarkRead, async (_event, payload): Promise<void> => {
    const { accountId, conversationId, protocolId } = ChatMarkReadSchema.parse(payload);
    await service.markRead(accountId, conversationId, protocolId);
  });

  handleAsync(IpcChannels.chatDiscoverRooms, async (_event, payload) => {
    const { accountId, service: mucService } = ChatDiscoverRoomsSchema.parse(payload);
    return service.discoverRooms(accountId, mucService);
  });

  handleAsync(IpcChannels.chatJoinRoom, async (_event, payload): Promise<string | null> => {
    const { accountId, roomJid } = ChatJoinRoomSchema.parse(payload);
    return service.joinRoom(accountId, roomJid);
  });

  handleAsync(IpcChannels.chatLeaveRoom, async (_event, payload): Promise<void> => {
    const { accountId, conversationId } = ChatLeaveRoomSchema.parse(payload);
    await service.leaveRoom(accountId, conversationId);
  });

  handleAsync(IpcChannels.chatSetRoomNotifyLevel, async (_event, payload): Promise<void> => {
    const { accountId, conversationId, level } = ChatSetRoomNotifyLevelSchema.parse(payload);
    await service.setRoomNotifyLevel(accountId, conversationId, level);
  });

  handleAsync(IpcChannels.chatSetMuted, async (_event, payload): Promise<void> => {
    const { accountId, conversationId, muted } = ChatSetMutedSchema.parse(payload);
    await service.setMuted(accountId, conversationId, muted);
  });

  handleAsync(IpcChannels.chatSetRoomTopic, async (_event, payload): Promise<void> => {
    const { accountId, conversationId, topic } = ChatSetRoomTopicSchema.parse(payload);
    await service.setRoomTopic(accountId, conversationId, topic);
  });

  handleAsync(IpcChannels.chatInviteToRoom, async (_event, payload): Promise<void> => {
    const { accountId, conversationId, invitee } = ChatInviteToRoomSchema.parse(payload);
    await service.inviteToRoom(accountId, conversationId, invitee);
  });

  handleAsync(IpcChannels.chatResolveMedia, async (_event, payload) => {
    const { accountId, mediaRef } = ChatResolveMediaSchema.parse(payload);
    return service.resolveMedia(accountId, mediaRef);
  });

  handleAsync(IpcChannels.chatReact, async (_event, payload): Promise<void> => {
    const { accountId, conversationId, messageId, emoji, on } = ChatReactSchema.parse(payload);
    await service.react(accountId, conversationId, messageId, emoji, on);
  });

  // Handled but not asserted here: `chat:state` is a MAIN→renderer push (webContents.send), not a
  // handler; the ChatService bootstrap wires it to the runner `emit` callback.
}
