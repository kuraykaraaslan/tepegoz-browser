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
  decideNotification,
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

/** A message worth surfacing — the host maps it to a redacted OS / center notification. */
export interface ChatNotification {
  accountId: string;
  conversationId: string;
  /** Sender display name / room name — never a raw JID where a name is known. */
  title: string;
  /** Message body, already length-capped. */
  body: string;
}

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
  /** Raise a notification for an inbound message (after `decideNotification`). Optional. */
  notify?: (notification: ChatNotification) => void;
}

const NOTIFY_BODY_MAX = 180;

export class ChatAccountRunner {
  private readonly accountId: string;
  private readonly state: ChatAccountState;
  private readonly manager: ChatConnectionManager;
  private readonly selfBareJid: string;
  private readonly selfNames: string[];
  private session: ChatSession | null = null;
  private tempSeq = 0;

  constructor(private readonly deps: AccountRunnerDeps) {
    this.accountId = deps.account.id;
    const bareJid = deriveBareJid(deps.account);
    this.selfBareJid = bareJid;
    this.selfNames = selfNames(deps.account, bareJid);
    this.state = new ChatAccountState({
      accountId: this.accountId,
      selfBareJid: bareJid,
      selfNames: this.selfNames,
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
        this.maybeNotify(change.message);
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
      case 'room': {
        // The occupant view is renderer-only, but a topic change is persisted onto the
        // conversation row so it survives a reload (and feeds the header's stored-topic fallback).
        const base = this.deps.store.getConversation(change.conversationId);
        if (base !== null && change.room.subject !== base.topic) {
          this.deps.store.upsertConversation({
            ...base,
            topic: change.room.subject,
            updatedAt: this.deps.now(),
          });
        }
        break;
      }
      case 'presence':
      case 'typing':
      case 'dropped':
        break;
    }
    this.deps.emit({ kind: 'change', accountId: this.accountId, change });
  }

  /** Route an inbound message through `decideNotification` and raise one if it survives. */
  private maybeNotify(message: ChatMessage): void {
    if (this.deps.notify === undefined || message.redacted || message.body === '') return;
    const conversation = this.deps.store.getConversation(message.conversationId);
    const decision = decideNotification({
      isRoom: conversation?.kind === 'room',
      ...(conversation !== null ? { level: conversation.notifyLevel, muted: conversation.muted } : {}),
      fromSelf: message.senderAddress === this.selfBareJid,
      selfNames: this.selfNames,
      body: message.body,
    });
    if (!decision.notify) return;
    this.deps.notify({
      accountId: this.accountId,
      conversationId: message.conversationId,
      title: message.senderName.trim() || (conversation?.name ?? '').trim() || message.senderAddress,
      body: message.body.slice(0, NOTIFY_BODY_MAX),
    });
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

  async joinRoom(roomJid: string): Promise<string | null> {
    if (this.deps.adapter.joinRoom === undefined) return null;
    const conversation = await this.deps.adapter.joinRoom(this.requireSession(), roomJid);
    this.deps.store.upsertConversation(conversation);
    return conversation.id;
  }

  async leaveRoom(conversationId: string): Promise<void> {
    const conv = this.deps.store.getConversation(conversationId);
    if (this.deps.adapter.leaveRoom !== undefined) {
      await this.deps.adapter.leaveRoom(this.requireSession(), conversationId);
    }
    if (conv !== null) this.deps.store.upsertConversation({ ...conv, isKnownContact: false, unread: 0 });
  }

  setRoomNotifyLevel(conversationId: string, level: 'all' | 'mentions' | 'none'): Promise<void> {
    const existing =
      this.deps.store.getConversation(conversationId) ??
      blankConversation(this.accountId, conversationId);
    this.deps.store.upsertConversation({ ...existing, notifyLevel: level });
    return Promise.resolve();
  }

  setMuted(conversationId: string, muted: boolean): Promise<void> {
    const existing =
      this.deps.store.getConversation(conversationId) ??
      blankConversation(this.accountId, conversationId);
    this.deps.store.upsertConversation({ ...existing, muted });
    return Promise.resolve();
  }

  async react(conversationId: string, messageId: string, emoji: string, on: boolean): Promise<void> {
    if (this.deps.adapter.react === undefined) {
      throw new Error('this protocol does not support reactions');
    }
    await this.deps.adapter.react(this.requireSession(), conversationId, messageId, emoji, on);
  }

  /**
   * Resolve a message `mediaRef` to a quarantined `data:` URL: the adapter turns the ref into a
   * fetchable {@link MediaLocator}, this runner performs the egress-bound GET (the kill-switch
   * applies), caps the size, and base64s the bytes. `null` when the protocol has no media repo, the
   * ref is malformed, the download fails, or it is over {@link MEDIA_MAX_BYTES}.
   */
  async resolveMedia(mediaRef: string): Promise<{ dataUrl: string } | null> {
    if (this.deps.adapter.resolveMedia === undefined) return null;
    const locator = this.deps.adapter.resolveMedia(this.requireSession(), mediaRef);
    if (locator === null) return null;
    if (!this.deps.mayEgress()) throw new Error('chat egress is blocked by the kill-switch');

    const res = await this.deps.transport.fetch(locator.url, {
      method: 'GET',
      headers: locator.headers,
      timeoutMs: MEDIA_FETCH_TIMEOUT_MS,
    });
    if (res.status >= 400) return null;
    const bytes = await res.bytes();
    if (bytes.byteLength === 0 || bytes.byteLength > MEDIA_MAX_BYTES) return null;

    const mime = sanitizeMediaMime(res.headers['content-type']);
    const base64 = Buffer.from(bytes).toString('base64');
    return { dataUrl: `data:${mime};base64,${base64}` };
  }
}

const MEDIA_MAX_BYTES = 12 * 1024 * 1024;
const MEDIA_FETCH_TIMEOUT_MS = 20_000;

/** Keep only a sane `type/subtype` from the server's `content-type`; default to a safe octet-stream. */
function sanitizeMediaMime(raw: string | undefined): string {
  const first = (raw ?? '').split(';', 1)[0]?.trim().toLowerCase() ?? '';
  return /^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/.test(first)
    ? first
    : 'application/octet-stream';
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
