import { createHash } from 'node:crypto';
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
  /** Newest-first-then-reversed page of everything already persisted for this conversation. */
  listMessages: (conversationId: string) => ChatMessage[];
  /** Every room-kind conversation id already known for this account — who to rejoin on connect. */
  listRoomIds: (accountId: string) => string[];
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

/**
 * A redacted audit fact for the Event Journal. NEVER carries a message body, a sender/JID, a room
 * address or any secret — only a truncated SHA-256 of the conversation id (enough to correlate a
 * thread across events), the account id, the protocol message id, the protocol name and a timestamp.
 */
export type ChatAuditEvent =
  | { kind: 'message-sent'; accountId: string; conversationHash: string; protocolId: string; ts: number }
  | { kind: 'account-added'; accountId: string; protocol: string; ts: number };

/** Truncated SHA-256 of a conversation id — a stable correlation key that reveals no JID / channel. */
export function hashConversationId(conversationId: string): string {
  return createHash('sha256').update(conversationId).digest('hex').slice(0, 16);
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
  /** Record a redacted "message sent" fact in the Event Journal. Optional. */
  audit?: (event: ChatAuditEvent) => void;
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
            // Fire-and-forget: a room's presence subscription lives only in the live session, so
            // every reconnect (including a cold app start) starts with an empty occupant list and
            // no ability to send until we resubscribe. One room failing to rejoin (banned, deleted,
            // offline) must not affect the others or the connection itself.
            void this.rejoinKnownRooms();
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

  /** True for a message this account itself sent. A DM's `senderAddress` is directly comparable to
   *  `selfBareJid`, but a room message's is protocol-shaped (XMPP: the full occupant JID
   *  `room@service/nick`; IRC: the bare nick; Matrix: the bare user id already) — so a room compares
   *  against its own `selfNick` instead, which every adapter's occupant fold derives in that same
   *  shape (see `chat-core`'s `RoomView`; `useChatState`'s `messageIsOwn` mirrors this for the UI). */
  private isFromSelf(message: ChatMessage): boolean {
    const room = this.state.roomView(message.conversationId);
    if (room === undefined) return message.senderAddress === this.selfBareJid;
    if (room.selfNick === null) return false;
    const slash = message.senderAddress.indexOf('/');
    const nick = slash === -1 ? message.senderAddress : message.senderAddress.slice(slash + 1);
    return nick === room.selfNick;
  }

  /** Route an inbound message through `decideNotification` and raise one if it survives. */
  private maybeNotify(message: ChatMessage): void {
    if (this.deps.notify === undefined || message.redacted || message.body === '') return;
    const conversation = this.deps.store.getConversation(message.conversationId);
    const decision = decideNotification({
      isRoom: conversation?.kind === 'room',
      ...(conversation !== null ? { level: conversation.notifyLevel, muted: conversation.muted } : {}),
      fromSelf: this.isFromSelf(message),
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
    this.deps.audit?.({
      kind: 'message-sent',
      accountId: this.accountId,
      conversationHash: hashConversationId(conversationId),
      protocolId: receipt.protocolId,
      ts: this.deps.now(),
    });
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
    // Opening a conversation for the first time: local storage already holds everything this
    // account has ever seen for it, so show that immediately — independent of live connectivity
    // and of whether the server (or, for a MUC room, its conference component) supports MAM at
    // all — then fold in whatever a live fetch adds. `before !== null` (scrolling further back)
    // keeps the live-only path below: local storage has no matching page for an opaque MAM cursor.
    if (before === null) {
      const local = this.deps.store.listMessages(conversationId);
      let live: { messages: ChatMessage[]; nextCursor: string | null } | null = null;
      if (this.session !== null) {
        try {
          live = await this.deps.adapter.history(this.session, conversationId, null);
        } catch {
          live = null;
        }
      }
      const merged = new Map<string, ChatMessage>();
      for (const m of local) merged.set(m.protocolId, m);
      if (live !== null) {
        for (const m of live.messages) merged.set(m.protocolId, m);
        for (const change of this.state.seedHistory(conversationId, live.messages)) {
          this.applyChange(change);
        }
      }
      return {
        messages: [...merged.values()].sort((a, b) => a.originTs - b.originTs),
        nextCursor: live?.nextCursor ?? null,
      };
    }
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

  /** Resubscribe to every room already known for this account — see the `connect` wrapper above. */
  private async rejoinKnownRooms(): Promise<void> {
    if (this.deps.adapter.joinRoom === undefined) return;
    for (const roomId of this.deps.store.listRoomIds(this.accountId)) {
      try {
        await this.joinRoom(roomId);
      } catch {
        // Best-effort, one room at a time — a single failure (banned, deleted, offline) must not
        // stop the rest from rejoining.
      }
    }
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

  /** Write the new topic; the server's echo drives the persisted `room-topic` update. */
  async setRoomTopic(conversationId: string, topic: string): Promise<void> {
    if (this.deps.adapter.setRoomTopic === undefined) return;
    await this.deps.adapter.setRoomTopic(this.requireSession(), conversationId, topic);
  }

  /** Ask the server to invite a contact to a room; any membership change comes back on the stream. */
  async inviteToRoom(conversationId: string, invitee: string): Promise<void> {
    if (this.deps.adapter.inviteToRoom === undefined) return;
    await this.deps.adapter.inviteToRoom(this.requireSession(), conversationId, invitee);
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
