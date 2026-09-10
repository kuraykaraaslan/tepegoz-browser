import type { ChatAccount, ChatContact, ChatMessage } from '@tepegoz/shared-types';
import type { ChatAdapter, ChatTransport, RoomSummary } from '@tepegoz/chat-adapters';
import { IrcAdapter, MatrixAdapter, XmppAdapter } from '@tepegoz/chat-adapters';
import type { ChatConnState } from '@tepegoz/chat-core';
import { AppError } from '@tepegoz/libs';
import {
  ChatAccountRunner,
  type ChatNotification,
  type ChatRunnerStore,
  type RunnerEmit,
} from './account-runner';

/**
 * The main-process owner of every live chat account: a map of `ChatAccountRunner`s, plus the
 * lifecycle that gates them — the extension being enabled, the profile in force, and the Phase-5
 * kill switch. All IO (the account list, the secret store, the DB-backed runner store, the egress
 * check, timers) is injected, so this is unit-tested against fakes; the `.electron.ts` adapter
 * supplies the real ones.
 */

export interface ChatSecretStore {
  get: (ref: string) => Promise<string | null>;
  set: (ref: string, plain: string) => Promise<void>;
  delete: (ref: string) => Promise<void>;
}

export interface ChatServiceDeps {
  /** The persisted, non-tombstoned accounts (from `ChatStore.listAccounts`). */
  loadAccounts: () => ChatAccount[];
  /** Persist / read / drop an account's vault secret (safeStorage-backed in the app). */
  secrets: ChatSecretStore;
  /** Persist an account row / drop it. */
  persistAccount: (account: ChatAccount) => void;
  deleteAccount: (id: string) => void;
  /** A fresh runner store (DB-backed) — one is handed to each runner. */
  makeRunnerStore: () => ChatRunnerStore;
  /** Override the adapter for a protocol (tests); defaults to `XmppAdapter` for `xmpp`. */
  makeAdapter?: (account: ChatAccount) => ChatAdapter;
  transport: ChatTransport;
  mayEgress: () => boolean;
  now: () => number;
  setTimer: (fn: () => void, ms: number) => unknown;
  clearTimer: (handle: unknown) => void;
  emit: (event: RunnerEmit) => void;
  /** Raise a notification for a message that survived `decideNotification`. Optional. */
  notify?: (notification: ChatNotification) => void;
  /** Whether the `com.tepegoz.chat` extension is enabled. */
  isEnabled: () => boolean;
}

export class ChatService {
  private readonly runners = new Map<string, ChatAccountRunner>();
  private started = false;

  constructor(private readonly deps: ChatServiceDeps) {}

  /** Load the persisted accounts and, if the extension is enabled, connect them. */
  async start(): Promise<void> {
    this.started = true;
    if (!this.deps.isEnabled()) return;
    for (const account of this.deps.loadAccounts()) {
      await this.spinUp(account);
    }
  }

  private async spinUp(account: ChatAccount): Promise<void> {
    if (this.runners.has(account.id)) return;
    const secret = await this.deps.secrets.get(account.secretRef);
    if (secret === null) {
      this.emitError(account.id, 'no stored credential');
      return;
    }

    let adapter: ChatAdapter;
    try {
      adapter = this.makeAdapter(account);
    } catch (err) {
      this.emitError(account.id, err instanceof Error ? err.message : String(err));
      return;
    }

    const runner = new ChatAccountRunner({
      account,
      secret,
      adapter,
      transport: this.deps.transport,
      store: this.deps.makeRunnerStore(),
      now: this.deps.now,
      setTimer: this.deps.setTimer,
      clearTimer: this.deps.clearTimer,
      mayEgress: this.deps.mayEgress,
      emit: this.deps.emit,
      ...(this.deps.notify !== undefined ? { notify: this.deps.notify } : {}),
    });
    this.runners.set(account.id, runner);
    runner.start();
  }

  private emitError(accountId: string, detail: string): void {
    this.deps.emit({ kind: 'state', accountId, state: 'error', detail });
  }

  private makeAdapter(account: ChatAccount): ChatAdapter {
    if (this.deps.makeAdapter !== undefined) return this.deps.makeAdapter(account);
    if (account.server.protocol === 'xmpp') return new XmppAdapter();
    if (account.server.protocol === 'irc') return new IrcAdapter();
    if (account.server.protocol === 'matrix') return new MatrixAdapter();
    throw new AppError(`Chat: no adapter for protocol "${account.server.protocol}" yet`, 501);
  }

  /** Add an account: store its secret, persist the row, and (if live) connect it. */
  async addAccount(account: ChatAccount, plainSecret: string): Promise<void> {
    await this.deps.secrets.set(account.secretRef, plainSecret);
    this.deps.persistAccount(account);
    if (this.started && this.deps.isEnabled()) await this.spinUp(account);
  }

  async removeAccount(id: string): Promise<void> {
    const runner = this.runners.get(id);
    if (runner !== undefined) {
      await runner.stop();
      this.runners.delete(id);
    }
    const account = this.deps.loadAccounts().find((a) => a.id === id);
    if (account !== undefined) await this.deps.secrets.delete(account.secretRef);
    this.deps.deleteAccount(id);
  }

  /** Stop every runner (profile switch, app quit). */
  async stop(): Promise<void> {
    await Promise.all([...this.runners.values()].map((r) => r.stop()));
    this.runners.clear();
  }

  /** The extension was enabled or disabled. */
  async setEnabled(enabled: boolean): Promise<void> {
    if (enabled) {
      if (this.started) await this.start();
    } else {
      await this.stop();
    }
  }

  /** The active profile's egress binding changed (kill switch on/off, connection up/down). */
  notifyEgressChange(): void {
    for (const runner of this.runners.values()) runner.notifyEgressChange();
  }

  accountStates(): Record<string, ChatConnState> {
    const out: Record<string, ChatConnState> = {};
    for (const [id, runner] of this.runners) out[id] = runner.connState;
    return out;
  }

  private require(accountId: string): ChatAccountRunner {
    const runner = this.runners.get(accountId);
    if (runner === undefined) throw new AppError(`Chat account "${accountId}" is not connected`, 409);
    return runner;
  }

  async sendMessage(
    accountId: string,
    conversationId: string,
    body: { body: string; replyToId?: string | null },
  ): Promise<string> {
    return this.require(accountId).sendMessage(conversationId, body);
  }

  async setPresence(
    accountId: string,
    presence: ChatContact['presence'],
    statusText?: string,
  ): Promise<void> {
    return this.require(accountId).setPresence(presence, statusText);
  }

  async markRead(accountId: string, conversationId: string, protocolId: string): Promise<void> {
    return this.require(accountId).markRead(conversationId, protocolId);
  }

  async history(
    accountId: string,
    conversationId: string,
    before: string | null,
  ): Promise<{ messages: ChatMessage[]; nextCursor: string | null }> {
    return this.require(accountId).history(conversationId, before);
  }

  async roster(accountId: string): Promise<ChatContact[]> {
    return this.require(accountId).roster();
  }

  async discoverRooms(accountId: string, service: string): Promise<RoomSummary[]> {
    return this.require(accountId).discoverRooms(service);
  }

  async joinRoom(accountId: string, roomJid: string): Promise<string | null> {
    return this.require(accountId).joinRoom(roomJid);
  }

  async leaveRoom(accountId: string, conversationId: string): Promise<void> {
    return this.require(accountId).leaveRoom(conversationId);
  }

  async setRoomNotifyLevel(
    accountId: string,
    conversationId: string,
    level: 'all' | 'mentions' | 'none',
  ): Promise<void> {
    return this.require(accountId).setRoomNotifyLevel(conversationId, level);
  }

  async setMuted(accountId: string, conversationId: string, muted: boolean): Promise<void> {
    return this.require(accountId).setMuted(conversationId, muted);
  }

  async setRoomTopic(accountId: string, conversationId: string, topic: string): Promise<void> {
    return this.require(accountId).setRoomTopic(conversationId, topic);
  }

  async react(
    accountId: string,
    conversationId: string,
    messageId: string,
    emoji: string,
    on: boolean,
  ): Promise<void> {
    return this.require(accountId).react(conversationId, messageId, emoji, on);
  }

  async resolveMedia(
    accountId: string,
    mediaRef: string,
  ): Promise<{ dataUrl: string } | null> {
    return this.require(accountId).resolveMedia(mediaRef);
  }
}
