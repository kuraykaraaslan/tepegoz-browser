import { BrowserWindow } from 'electron';
import { IpcChannels, isExtensionEnabled } from '@tepegoz/desktop-ipc';
import { currentEgressRoute } from '@tepegoz/http';
import { NodeChatTransport } from '@tepegoz/chat-transport-node';
import type { ChatAccount } from '@tepegoz/shared-types';
import type { Db } from '@tepegoz/persistence';
import PreferenceStore from '@tepegoz/preferences';
import { getDb } from '../db/database.electron';
import { createChatDialer } from './egress-dialer';
import ChatSecrets from './chat-secrets.electron';
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
import type { RunnerEmit } from './account-runner';
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
    isEnabled: chatExtensionEnabled,
    ...over,
  });
}

/** Start the messenger: build the service and connect enabled accounts. Idempotent. */
export async function init(): Promise<void> {
  if (service !== null) return;
  service = buildChatService();
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

/** React to the extension being toggled in Settings. */
export async function setEnabled(enabled: boolean): Promise<void> {
  await service?.setEnabled(enabled);
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
  getHistory: (accountId, conversationId, before) =>
    requireService().history(accountId, conversationId, before),
  sendMessage: (accountId, conversationId, body) =>
    requireService().sendMessage(accountId, conversationId, body),
  setPresence: (accountId, presence, statusText) =>
    requireService().setPresence(accountId, presence, statusText),
  markRead: (accountId, conversationId, protocolId) =>
    requireService().markRead(accountId, conversationId, protocolId),
};

/** Test seam. */
export function __setServiceForTest(next: ChatService | null): void {
  service = next;
}
