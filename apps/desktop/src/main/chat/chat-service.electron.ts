import { app, BrowserWindow } from 'electron';
import { IpcChannels, isExtensionEnabled } from '@tepegoz/desktop-ipc';
import { currentEgressRoute } from '@tepegoz/http';
import { NodeChatTransport } from '@tepegoz/chat-transport-node';
import type { ChatAccount } from '@tepegoz/shared-types';
import type { Db } from '@tepegoz/persistence';
import PreferenceStore from '@tepegoz/preferences';
import { getDb } from '../db/database.electron';
import NotificationHost from '../notifications/notification-host';
import { ChatStore, EventJournal } from '@tepegoz/persistence';
import { randomUUID } from 'node:crypto';
import { createChatDialer } from './egress-dialer';
import { seedChatAccountsFromEnv } from './chat-seed.electron';
import ChatSecrets from './chat-secrets.electron';
import { createChatCapabilityHost } from './chat-capability-host';
import FileOperationsHost from '../file-operations/file-operations-host';
import {
  deleteAccount,
  listAccountSummaries,
  listAccounts,
  listContacts,
  listConversations,
  makeRunnerStore,
  upsertAccount,
} from './chat-store-adapter';
import { ChatService, type ChatServiceDeps } from './chat-service';
import type { ChatAuditEvent, RunnerEmit } from './account-runner';
import type { ChatIpcService } from '../ipc/ipc-chat';

/** `com.tepegoz.chat` — the messenger extension id. */
export const CHAT_EXTENSION_ID = 'com.tepegoz.chat';

/** Push a folded change / connection-state update to every chrome window. Exported for tests. */
export function broadcastChatEvent(event: RunnerEmit): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(IpcChannels.chatState, event);
  }
}

/** True unless a General binding is in force that cannot currently be honoured (kill switch). */
export function chatMayEgress(): boolean {
  const route = currentEgressRoute();
  return route.mode === 'direct' || route.socksPort > 0;
}

/** Whether `com.tepegoz.chat` is enabled in preferences. */
export function chatExtensionEnabled(): boolean {
  return isExtensionEnabled(PreferenceStore.getAll().extensions, CHAT_EXTENSION_ID);
}

/** Raise a redacted messenger notification for a message that survived `decideNotification`. */
export function chatNotify(n: {
  accountId: string;
  conversationId: string;
  title: string;
  body: string;
}): void {
  NotificationHost.push({
    source: 'chat',
    kind: 'info',
    title: n.title,
    body: n.body,
    channels: ['center', 'native'],
  });
}

/**
 * Append a redacted chat fact to the Event Journal. The payload is deliberately content-free — a
 * conversation-id hash, the account, the protocol / protocol id and a timestamp — so the audit trail
 * records *that* a message was sent or an account added, never what, to whom, or which room, and
 * never a secret.
 */
export function chatAudit(event: ChatAuditEvent): void {
  const db = getDb();
  if (db === null) return;
  try {
    if (event.kind === 'message-sent') {
      EventJournal.append(db, {
        id: randomUUID(),
        type: 'ChatMessageSent',
        ts: event.ts,
        actor: 'user',
        correlationId: event.conversationHash,
        redacted: true,
        payload: {
          accountId: event.accountId,
          conversationHash: event.conversationHash,
          protocolId: event.protocolId,
        },
      });
    } else {
      EventJournal.append(db, {
        id: randomUUID(),
        type: 'ChatAccountAdded',
        ts: event.ts,
        actor: 'user',
        correlationId: event.accountId,
        redacted: true,
        payload: { accountId: event.accountId, protocol: event.protocol },
      });
    }
  } catch {
    /* the journal must never be able to break a send / add */
  }
}

function requireDb(): Db {
  const handle = getDb();
  if (handle === null) throw new Error('chat: the profile database is not open');
  return handle;
}

let service: ChatService | null = null;

/** Build a `ChatService` bound to the real process singletons (deps overridable for tests). */
export function buildChatService(over: Partial<ChatServiceDeps> = {}): ChatService {
  return new ChatService({
    loadAccounts: () => (getDb() === null ? [] : listAccounts(requireDb())),
    secrets: ChatSecrets,
    persistAccount: (account) => upsertAccount(requireDb(), account),
    deleteAccount: (id) => deleteAccount(requireDb(), id),
    makeRunnerStore: () => makeRunnerStore(requireDb()),
    transport: new NodeChatTransport({ dial: createChatDialer() }),
    mayEgress: chatMayEgress,
    now: () => Date.now(),
    setTimer: (fn, ms) => setTimeout(fn, ms),
    clearTimer: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
    emit: broadcastChatEvent,
    notify: chatNotify,
    audit: chatAudit,
    isEnabled: chatExtensionEnabled,
    ...over,
  });
}

/** Start the messenger: build the service and connect enabled accounts. Idempotent. */
export async function init(): Promise<void> {
  if (service !== null) return;
  service = buildChatService();
  await seedChatAccountsFromEnv(
    {
      listAccounts: () => (getDb() === null ? [] : listAccounts(requireDb())),
      addAccount: (account, plainSecret) => requireService().addAccount(account, plainSecret),
    },
    { isPackaged: app.isPackaged },
  );
  await service.start();
}

/** Stop every connection (app quit, profile switch). */
export async function stop(): Promise<void> {
  if (service === null) return;
  await service.stop();
  service = null;
}

/** Re-evaluate the kill switch for every live account. */
export function notifyEgressChange(): void {
  service?.notifyEgressChange();
}

/** React to the extension being toggled in Settings (reads the live preference). */
export async function reconcile(): Promise<void> {
  await service?.setEnabled(chatExtensionEnabled());
}

function requireService(): ChatService {
  if (service === null) throw new Error('chat: the ChatService is not initialised');
  return service;
}

/** The `ChatIpcService` the `chat:*` handlers delegate to. */
export const chatIpcService: ChatIpcService = {
  listAccounts: () => (getDb() === null ? [] : listAccountSummaries(requireDb())),
  accountStates: () => service?.accountStates() ?? {},
  addAccount: (_accountId, plainSecret, account) =>
    requireService().addAccount(account as ChatAccount, plainSecret),
  removeAccount: (accountId) => requireService().removeAccount(accountId),
  listConversations: (accountId) =>
    getDb() === null ? [] : listConversations(requireDb(), accountId),
  getRoster: (accountId) => (getDb() === null ? [] : listContacts(requireDb(), accountId)),
  addContact: (accountId, address) => requireService().addContact(accountId, address),
  getHistory: (accountId, conversationId, before) =>
    requireService().history(accountId, conversationId, before),
  sendMessage: (accountId, conversationId, body) =>
    requireService().sendMessage(accountId, conversationId, body),
  setPresence: (accountId, presence, statusText) =>
    requireService().setPresence(accountId, presence, statusText),
  markRead: (accountId, conversationId, protocolId) =>
    requireService().markRead(accountId, conversationId, protocolId),
  discoverRooms: (accountId, service) => requireService().discoverRooms(accountId, service),
  joinRoom: (accountId, roomJid) => requireService().joinRoom(accountId, roomJid),
  leaveRoom: (accountId, conversationId) => requireService().leaveRoom(accountId, conversationId),
  setRoomNotifyLevel: (accountId, conversationId, level) =>
    requireService().setRoomNotifyLevel(accountId, conversationId, level),
  setMuted: (accountId, conversationId, muted) =>
    requireService().setMuted(accountId, conversationId, muted),
  setRoomTopic: (accountId, conversationId, topic) =>
    requireService().setRoomTopic(accountId, conversationId, topic),
  inviteToRoom: (accountId, conversationId, invitee) =>
    requireService().inviteToRoom(accountId, conversationId, invitee),
  resolveMedia: (accountId, mediaRef) => requireService().resolveMedia(accountId, mediaRef),
  react: (accountId, conversationId, messageId, emoji, on) =>
    requireService().react(accountId, conversationId, messageId, emoji, on),
};

/** Test seam. */
export function __setServiceForTest(next: ChatService | null): void {
  service = next;
}

/** Conversation ids the user opted the agent into this session (X-chat.6 unknown-contact gate). */
const chatAgentOptIns = new Set<string>();

/** The agent `chat_*` capability host — `ChatService` + DB-backed reads through the agent-view guards. */
export function chatCapabilityHost(): ReturnType<typeof createChatCapabilityHost> {
  return createChatCapabilityHost({
    listConversations: (accountId) => (getDb() === null ? [] : listConversations(requireDb(), accountId)),
    getConversation: (id) => (getDb() === null ? null : ChatStore.getConversation(requireDb(), id)),
    listContacts: (accountId) => (getDb() === null ? [] : listContacts(requireDb(), accountId)),
    searchMessages: (opts) => (getDb() === null ? [] : ChatStore.searchMessages(requireDb(), opts)),
    history: (accountId, conversationId, before) =>
      requireService().history(accountId, conversationId, before),
    setPresence: (accountId, presence, statusText) =>
      requireService().setPresence(accountId, presence, statusText),
    markRead: (accountId, conversationId, protocolId) =>
      requireService().markRead(accountId, conversationId, protocolId),
    sendMessage: (accountId, conversationId, body) =>
      requireService().sendMessage(accountId, conversationId, body),
    joinRoom: (accountId, address) => requireService().joinRoom(accountId, address),
    leaveRoom: (accountId, conversationId) => requireService().leaveRoom(accountId, conversationId),
    setMuted: (accountId, conversationId, muted) =>
      requireService().setMuted(accountId, conversationId, muted),
    react: (accountId, conversationId, messageId, emoji, on) =>
      requireService().react(accountId, conversationId, messageId, emoji, on),
    getMessage: (conversationId, messageId) =>
      getDb() === null ? null : ChatStore.getMessage(requireDb(), conversationId, messageId),
    resolveMedia: (accountId, mediaRef) => requireService().resolveMedia(accountId, mediaRef),
    quarantineMedia: ({ bytes, suggestedName }) =>
      FileOperationsHost.writeAttachment(suggestedName, bytes),
    sessionOptIns: () => chatAgentOptIns,
    mayEgress: chatMayEgress,
  });
}

/**
 * Thin facade over the messenger module functions, matching the `XService.*` static surface every other
 * main-process service in this app presents (`TaskService`, `McpService`, …). `app` bootstrap calls
 * {@link ChatMessenger.init} in deferred init and {@link ChatMessenger.stop} in `before-quit`; the
 * `chat:*` IPC handlers are registered with {@link chatIpcService}.
 */
export default class ChatMessenger {
  static init(): Promise<void> {
    return init();
  }

  static stop(): Promise<void> {
    return stop();
  }

  static notifyEgressChange(): void {
    notifyEgressChange();
  }

  static reconcile(): Promise<void> {
    return reconcile();
  }

  static capabilityHost(): ReturnType<typeof chatCapabilityHost> {
    return chatCapabilityHost();
  }
}
