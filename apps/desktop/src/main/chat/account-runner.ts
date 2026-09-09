import type {
  ChatAccount,
  ChatContact,
  ChatConversation,
  ChatMessage,
} from '@tepegoz/shared-types';
import type { ChatAdapter, ChatSession, RoomSummary } from '@tepegoz/chat-adapters';
import type { ChatTransport } from '@tepegoz/chat-adapters';
import {
  ChatAccountState,
  ChatConnectionManager,
  type ChatConnState,
  type ChatStateChange,
} from '@tepegoz/chat-core';

/**
 * One account's worth of live chat: the adapter's raw event stream folded into per-conversation
 * state and persisted, plus the send / presence / history / roster methods. The reconnect lifecycle
 * and the kill-switch are `ChatConnectionManager`'s job; this is the glue between it, the fold
 * (`ChatAccountState`) and the store.
 *
 * IO-free by injection: the store, adapter, transport, clock and timers are all supplied by
 * `ChatService`, so this is unit-tested against fakes.
 */

/** The narrow slice of `ChatStore` a runner writes. */
export interface ChatRunnerStore {
  upsertMessage: (message: ChatMessage) => void;
  redactMessage: (conversationId: string, protocolId: string) => void;
  upsertConversation: (conversation: ChatConversation) => void;
  upsertContact: (contact: ChatContact) => void;
  getConversation: (id: string) => ChatConversation | null;
}

/** What the runner pushes to the renderer (the desktop maps these onto an IPC channel). */
export type RunnerEmit =
  | { kind: 'state'; accountId: string; state: ChatConnState; detail?: string }
  | { kind: 'change'; accountId: string; change: ChatStateChange };

export interface AccountRunnerDeps {
  account: ChatAccount;
  /** Plaintext secret, resolved from the vault by `ChatService`. */
  secret: string;
  adapter: ChatAdapter;
  transport: ChatTransport;
  store: ChatRunnerStore;
  now: () => number;
  setTimer: (fn: () => void, ms: number) => unknown;
  clearTimer: (h: unknown) => void;
  mayEgress: () => boolean;
  emit: (event: RunnerEmit) => void;
}

export class ChatAccountRunner {
  private readonly accountId: string;
  private readonly state: ChatAccountState;
  private readonly manager: ChatConnectionManager;
  private session: ChatSession | null = null;
  private tempSeq = 0;

  constructor(private readonly deps: AccountRunnerDeps) {
    this.accountId = deps.account.id;
    const bareJid = deriveBareJid(deps.account);
    this.state = new ChatAccountState({
      accountId: this.accountId,
      selfBareJid: bareJid,
      selfNames: selfNames(deps.account, bareJid),
      caps: deps.adapter.capabilities,
    });
    this.manager = new ChatConnectionManager({
      adapter: {
        connect: (creds, transport) =>
          deps.adapter.connect(creds as never, transport as never).then((s) => {
            this.session = s;
            return s as never;
          }),
        disconnect: (s) => deps.adapter.disconnect(s as ChatSession),
        events: (s) => deps.adapter.events(s as ChatSession),
      },
      creds: { accountId: this.accountId, server: deps.account.server, secret: deps.secret },
      transport: deps.transport,
      now: deps.now,
      setTimer: deps.setTimer,
      clearTimer: deps.clearTimer,
      mayEgress: deps.mayEgress,
      onState: (s, detail) => {
        if (s !== 'online') this.session = null;
        this.deps.emit(
          detail !== undefined
            ? { kind: 'state', accountId: this.accountId, state: s, detail }
            : { kind: 'state', accountId: this.accountId, state: s },
        );
      },
      onEvent: (raw) => this.ingest(raw),
    });
  }

  get connState(): ChatConnState {
    return this.manager.state;
  }

  start(): void {
    this.manager.start();
  }

  async stop(): Promise<void> {
    await this.manager.stop();
    this.session = null;
  }

  notifyEgressChange(): void {
    this.manager.notifyEgressChange();
  }

  /** Fold + persist + emit one raw adapter event. */
  private ingest(raw: unknown): void {
    for (const change of this.state.applyRaw(raw)) this.applyChange(change);
  }

  private applyChange(change: ChatStateChange): void {
    switch (change.kind) {
      case 'message':
        this.deps.store.upsertMessage(change.message);
        break;
      case 'message-updated':
        if (change.message === null || change.message.redacted) {
          this.deps.store.redactMessage(
            change.conversationId,
            change.message?.protocolId ?? change.protocolId,
          );
        } else {
          this.deps.store.upsertMessage(change.message);
        }
        break;
      case 'conversation': {
        const base =
          this.deps.store.getConversation(change.conversationId) ??
          blankConversation(this.accountId, change.conversationId);
        this.deps.store.upsertConversation({
          ...base,
          unread: change.unread,
          mentions: change.mentions,
          lastReadId: change.lastReadId,
          updatedAt: this.deps.now(),
        });
        break;
      }
      case 'roster':
        if (!change.removed) this.deps.store.upsertContact(change.contact);
        break;
      // `room` carries the live occupant/subject view — pushed to the renderer, not yet persisted
      // (no room table until the room browser lands).
      case 'presence':
      case 'typing':
      case 'room':
      case 'dropped':
        break;
    }
    this.deps.emit({ kind: 'change', accountId: this.accountId, change });
  }

  private requireSession(): ChatSession {
    if (this.session === null) throw new Error(`chat account ${this.accountId} is not connected`);
    return this.session;
  }

  async sendMessage(
    conversationId: string,
    body: { body: string; replyToId?: string | null },
  ): Promise<string> {
    const session = this.requireSession();
    const tempId = `local-${String(this.deps.now())}-${String(++this.tempSeq)}`;
    const bareJid = deriveBareJid(this.deps.account);
    const temp: ChatMessage = {
      id: tempId,
      conversationId,
      accountId: this.accountId,
      protocolId: tempId,
      senderAddress: bareJid,
      senderName: this.deps.account.displayName,
      kind: 'text',
      body: body.body,
      mediaRef: null,
      replyToId: body.replyToId ?? null,
      reactions: [],
      editedAt: null,
      redacted: false,
      originTs: this.deps.now(),
      receivedAt: this.deps.now(),
      deliveryState: 'pending',
    };
    // The optimistic echo is shown immediately but NOT persisted — its temp protocol id would
    // otherwise leave a stale row once the server acks with the real one. It reaches the store via
    // the reconcile below.
    for (const change of this.state.echoLocalSend(temp)) {
      this.deps.emit({ kind: 'change', accountId: this.accountId, change });
    }

    const receipt = await this.deps.adapter.sendMessage(session, conversationId, {
      body: body.body,
      replyToId: body.replyToId ?? null,
      mediaPath: null,
    });
    const settled: ChatMessage = { ...temp, id: receipt.protocolId, protocolId: receipt.protocolId, deliveryState: 'sent' };
    for (const change of this.state.reconcileSend(conversationId, tempId, settled)) {
      this.applyChange(change);
    }
    return receipt.protocolId;
  }

  async setPresence(presence: ChatContact['presence'], statusText?: string): Promise<void> {
    await this.deps.adapter.setPresence(this.requireSession(), presence, statusText);
  }

  async markRead(conversationId: string, protocolId: string): Promise<void> {
    for (const change of this.state.markConversationRead(conversationId, protocolId)) {
      this.applyChange(change);
    }
    await this.deps.adapter.markRead(this.requireSession(), conversationId, protocolId);
  }

  async history(
    conversationId: string,
    before: string | null,
  ): Promise<{ messages: ChatMessage[]; nextCursor: string | null }> {
    const page = await this.deps.adapter.history(this.requireSession(), conversationId, before);
    for (const change of this.state.seedHistory(conversationId, page.messages)) {
      this.applyChange(change);
    }
    return page;
  }

  async roster(): Promise<ChatContact[]> {
    const contacts = await this.deps.adapter.roster(this.requireSession());
    for (const contact of contacts) this.deps.store.upsertContact(contact);
    return contacts;
  }

  async discoverRooms(service: string): Promise<RoomSummary[]> {
    if (this.deps.adapter.discoverRooms === undefined) return [];
    return this.deps.adapter.discoverRooms(this.requireSession(), service);
  }

  async joinRoom(roomJid: string): Promise<void> {
    if (this.deps.adapter.joinRoom === undefined) return;
    const conversation = await this.deps.adapter.joinRoom(this.requireSession(), roomJid);
    this.deps.store.upsertConversation(conversation);
  }
}

function deriveBareJid(account: ChatAccount): string {
  if (account.server.protocol === 'xmpp') {
    const jid = account.server.jid;
    return jid.includes('/') ? jid.slice(0, jid.indexOf('/')) : jid;
  }
  if (account.server.protocol === 'matrix') return account.server.userId;
  if (account.server.protocol === 'irc') return account.server.nick;
  return account.id;
}

function selfNames(account: ChatAccount, bareJid: string): string[] {
  const names = new Set<string>([bareJid]);
  if (account.displayName.length > 0) names.add(account.displayName);
  const at = bareJid.indexOf('@');
  if (at > 0) names.add(bareJid.slice(0, at));
  return [...names];
}

function blankConversation(accountId: string, id: string): ChatConversation {
  return {
    id,
    accountId,
    kind: id.includes('/') ? 'room' : 'dm',
    address: id,
    name: id,
    topic: '',
    memberCount: 0,
    unread: 0,
    mentions: 0,
    lastReadId: null,
    muted: false,
    notifyLevel: 'all',
    isKnownContact: false,
    updatedAt: 0,
  };
}
