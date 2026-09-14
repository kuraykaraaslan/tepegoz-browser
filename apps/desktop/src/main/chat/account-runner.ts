import { createHash } from 'node:crypto';
import { AppError } from '@tepegoz/libs';
import type {
  ChatAccount,
  ChatContact,
  ChatConversation,
  ChatConversationLastMessage,
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
  /** A targeted update, deliberately separate from `upsertContact` — see
   *  `ChatStore.setContactBlocked`'s own docstring for why. */
  setContactBlocked: (accountId: string, address: string, blocked: boolean) => void;
  getConversation: (id: string) => ChatConversation | null;
  /** Newest-first-then-reversed page of everything already persisted for this conversation. */
  listMessages: (conversationId: string) => ChatMessage[];
  /** Every room-kind conversation id already known for this account — who to rejoin on connect. */
  listRoomIds: (accountId: string) => string[];
  /** Every conversation's persisted read marker (DMs and rooms) — seeds `ChatAccountState` so a
   *  reconnect's history replay doesn't recount already-read messages as unread. See
   *  `ChatAccountState.seedLastRead`. */
  listReadMarkers: (accountId: string) => ReadonlyArray<{ id: string; lastReadId: string | null }>;
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
  /** Read an attachment's bytes out of the file-operations sandbox, for `sendMessage`'s `mediaPath`
   *  → `uploadMedia` → `mediaRef` step. Optional — a `mediaPath` on a deps-less runner (or a
   *  protocol whose adapter has no `uploadMedia`) throws rather than silently dropping the
   *  attachment; see `sendMessage`. */
  readMediaBytes?: (sandboxPath: string) => Promise<{ bytes: Uint8Array; mime: string; filename: string }>;
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
    // Seed every known conversation's read marker before the first connect: a fresh
    // `ChatAccountState` otherwise starts `lastReadId: null` for all of them, so a reconnect's
    // history replay (MUC rejoin, MAM/`/sync` catch-up) re-delivers already-read messages as fresh
    // events and `recount()` marks them unread again with no persisted marker to anchor against.
    for (const { id, lastReadId } of deps.store.listReadMarkers(this.accountId)) {
      this.state.seedLastRead(id, lastReadId);
    }
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

  /** `chat_messages.conversation_id` is a foreign key onto `chat_conversations` — a message for a
   *  conversation that has no row yet (a DM's very first-ever message, before any `conversation`
   *  fold or explicit open) would otherwise violate it and crash the whole event pump into a
   *  reconnect loop that hits the exact same missing row again. Same shape as the `'room'` case
   *  below (found first, for Matrix's passive room discovery); DMs need the identical guard because
   *  `foldConversation`'s `'message'` change is emitted and applied BEFORE its paired `'conversation'`
   *  change reaches here, so that one is too late to rely on. */
  private ensureConversation(conversationId: string): void {
    if (this.deps.store.getConversation(conversationId) === null) {
      this.deps.store.upsertConversation({
        ...blankConversation(this.accountId, conversationId),
        updatedAt: this.deps.now(),
      });
    }
  }

  /** Refresh the conversation list's preview row. Never regresses it: MAM/history catch-up can
   *  deliver a live 'message' event for something OLDER than what's already shown (out-of-order
   *  reconnect catch-up), so this only advances `lastMessage` when the arriving message is at least
   *  as new as what's stored. Called AFTER `ensureConversation`, so the row always exists here. */
  private bumpLastMessage(message: ChatMessage): void {
    const conv = this.deps.store.getConversation(message.conversationId);
    if (conv === null) return;
    if (conv.lastMessage !== null && message.originTs < conv.lastMessage.originTs) return;
    this.deps.store.upsertConversation({ ...conv, lastMessage: toLastMessage(message) });
  }

  /** An edit (XEP-0308 / `m.replace`) only needs to touch the preview row when it lands on the
   *  message the preview is CURRENTLY showing — an edit to some older message further up the
   *  timeline should not resurrect it as the "latest" one. */
  private refreshLastMessageIfCurrent(message: ChatMessage): void {
    const conv = this.deps.store.getConversation(message.conversationId);
    if (conv === null || conv.lastMessage?.protocolId !== message.protocolId) return;
    this.deps.store.upsertConversation({ ...conv, lastMessage: toLastMessage(message) });
  }

  /** A redaction of the message the preview is currently showing needs the same in-place refresh —
   *  `redactMessage` already flipped the stored row itself; this just re-reads it into the preview
   *  so the list shows "Message deleted" instead of the pre-redaction text. */
  private redactLastMessageIfCurrent(conversationId: string, protocolId: string): void {
    const conv = this.deps.store.getConversation(conversationId);
    if (conv === null || conv.lastMessage?.protocolId !== protocolId) return;
    this.deps.store.upsertConversation({
      ...conv,
      lastMessage: { ...conv.lastMessage, body: '', redacted: true },
    });
  }

  private applyChange(change: ChatStateChange): void {
    switch (change.kind) {
      case 'message':
        this.ensureConversation(change.message.conversationId);
        this.deps.store.upsertMessage(change.message);
        this.bumpLastMessage(change.message);
        this.maybeNotify(change.message);
        break;
      case 'message-updated':
        if (change.message === null || change.message.redacted) {
          const protocolId = change.message?.protocolId ?? change.protocolId;
          this.deps.store.redactMessage(change.conversationId, protocolId);
          this.redactLastMessageIfCurrent(change.conversationId, protocolId);
        } else {
          this.ensureConversation(change.message.conversationId);
          this.deps.store.upsertMessage(change.message);
          this.refreshLastMessageIfCurrent(change.message);
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
        const base = this.deps.store.getConversation(change.conversationId);
        if (base === null) {
          // A room-membership fold fires for a room Tepegöz never explicitly joined too — Matrix
          // reports every room the account is already a member of on its very first `/sync`, with
          // no `joinRoom()` call in between. Without a conversation row here, the FIRST message
          // event for that room (same sync, or any later one) violates `chat_messages`' foreign key
          // on `conversation_id` — which crashes the whole event pump and forces a full reconnect,
          // which re-syncs from scratch and hits the exact same missing row again: an account with
          // any pre-existing Matrix room history could never get past its own initial sync.
          this.deps.store.upsertConversation({
            ...blankConversation(this.accountId, change.conversationId),
            kind: 'room',
            name: change.conversationId,
            topic: change.room.subject,
            updatedAt: this.deps.now(),
          });
          break;
        }
        // The occupant view is renderer-only, but a topic change is persisted onto the
        // conversation row so it survives a reload (and feeds the header's stored-topic fallback).
        if (change.room.subject !== base.topic) {
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
    // A plain Error here used to collapse to an opaque "500 Internal error" at the IPC boundary
    // (toBoundary maps anything that isn't an AppError that way) — indistinguishable from a real
    // main-process fault, and useless to whoever hit it (e.g. joining a room the instant an account
    // is added, before its connection has finished handshaking).
    if (this.session === null) {
      throw new AppError(`Chat account "${this.accountId}" is not connected`, 409);
    }
    return this.session;
  }

  /** `mediaPath` → bytes (sandbox read) → `adapter.uploadMedia` → a protocol `mediaRef`. Throws
   *  rather than silently dropping the attachment: no `readMediaBytes` deps wired, or an adapter
   *  with no `uploadMedia` (the protocol has no media repo — a caller should have checked
   *  `session.caps.media` first, same convention as every other optional-capability method). */
  private async uploadAttachment(session: ChatSession, mediaPath: string): Promise<string> {
    if (this.deps.adapter.uploadMedia === undefined) {
      throw new AppError('this protocol has no media upload support', 501);
    }
    if (this.deps.readMediaBytes === undefined) {
      throw new AppError('no media reader configured for this account', 501);
    }
    const media = await this.deps.readMediaBytes(mediaPath);
    return this.deps.adapter.uploadMedia(session, media);
  }

  async sendMessage(
    conversationId: string,
    body: { body: string; replyToId?: string | null; mediaPath?: string | null },
  ): Promise<string> {
    const session = this.requireSession();
    // Upload BEFORE the optimistic echo, so a slow/failed upload never shows a "sent" bubble for an
    // attachment that never went anywhere — the echo only appears once the real mediaRef is known.
    const mediaRef =
      body.mediaPath !== undefined && body.mediaPath !== null
        ? await this.uploadAttachment(session, body.mediaPath)
        : null;

    const tempId = `local-${String(this.deps.now())}-${String(++this.tempSeq)}`;
    const bareJid = deriveBareJid(this.deps.account);
    const temp: ChatMessage = {
      id: tempId,
      conversationId,
      accountId: this.accountId,
      protocolId: tempId,
      senderAddress: bareJid,
      senderName: this.deps.account.displayName,
      kind: mediaRef !== null ? 'media' : 'text',
      body: body.body,
      mediaRef,
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

    // No adapter reads `mediaPath` yet (XEP-0363 / MSC upload-and-embed is the "separate, larger
    // piece of work" `http-upload.ts` flags) — `mediaRef` above is for the local echo/store only.
    const receipt = await this.deps.adapter.sendMessage(session, conversationId, {
      body: body.body,
      replyToId: body.replyToId ?? null,
      mediaPath: body.mediaPath ?? null,
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
        // A history refetch reconstructs each message from scratch — reactions, edits, and
        // redactions all arrive as SEPARATE wire events the reconstruction never sees, so it always
        // comes back with `reactions: []`, `editedAt: null`, `redacted: false`. Letting it overwrite
        // a message local storage already has (previously found live: every reconnect that re-synced
        // a conversation silently wiped its reactions, both on screen and in the DB via the
        // `seedHistory`/`upsertMessage` write below) would erase state only the local row still
        // remembers. Only messages local doesn't have yet are new information here.
        const newToLocal = live.messages.filter((m) => !merged.has(m.protocolId));
        for (const m of newToLocal) merged.set(m.protocolId, m);
        for (const change of this.state.seedHistory(conversationId, newToLocal)) {
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

  /** The forever mute — always clears any TIMED mute too, so switching between the two never leaves
   *  the other one's state stale (a leftover `mutedUntil` from a previous timed mute must not silently
   *  reactivate once `muted` is later turned back off). */
  setMuted(conversationId: string, muted: boolean): Promise<void> {
    const existing =
      this.deps.store.getConversation(conversationId) ??
      blankConversation(this.accountId, conversationId);
    this.deps.store.upsertConversation({ ...existing, muted, mutedUntil: null });
    return Promise.resolve();
  }

  /** A timed mute — `durationMs: null` means forever (same effect as `setMuted(true)`, through the
   *  same field, so there is only ever one "is this forever-muted" bit to check). */
  muteFor(conversationId: string, durationMs: number | null): Promise<void> {
    const existing =
      this.deps.store.getConversation(conversationId) ??
      blankConversation(this.accountId, conversationId);
    this.deps.store.upsertConversation(
      durationMs === null
        ? { ...existing, muted: true, mutedUntil: null }
        : { ...existing, muted: false, mutedUntil: this.deps.now() + durationMs },
    );
    return Promise.resolve();
  }

  /** Archiving is a purely local presentation flag — no protocol has a matching wire concept, and it
   *  does not affect delivery, unread counting, or anything else: an archived conversation still
   *  receives messages exactly as before, it just starts out of the default list. */
  setArchived(conversationId: string, archived: boolean): Promise<void> {
    const existing =
      this.deps.store.getConversation(conversationId) ??
      blankConversation(this.accountId, conversationId);
    this.deps.store.upsertConversation({ ...existing, archived });
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

  async addContact(address: string): Promise<void> {
    if (this.deps.adapter.addContact === undefined) {
      throw new AppError('this protocol has no roster / contacts concept', 501);
    }
    await this.deps.adapter.addContact(this.requireSession(), address);
  }

  async removeContact(address: string): Promise<void> {
    if (this.deps.adapter.removeContact === undefined) {
      throw new AppError('this protocol has no roster / contacts concept', 501);
    }
    await this.deps.adapter.removeContact(this.requireSession(), address);
  }

  /** Write-through: persists `blocked` right after a successful server round trip — neither
   *  protocol's block state arrives as a normal roster-push the fold path already handles, so there
   *  is no live event to derive it from instead. */
  async blockContact(address: string, blocked: boolean): Promise<void> {
    if (this.deps.adapter.blockContact === undefined || this.deps.adapter.unblockContact === undefined) {
      throw new AppError('this protocol has no server-side blocking concept', 501);
    }
    if (blocked) {
      await this.deps.adapter.blockContact(this.requireSession(), address);
    } else {
      await this.deps.adapter.unblockContact(this.requireSession(), address);
    }
    this.deps.store.setContactBlocked(this.accountId, address, blocked);
  }

  async react(conversationId: string, messageId: string, emoji: string, on: boolean): Promise<void> {
    if (this.deps.adapter.react === undefined) {
      throw new AppError('this protocol does not support reactions', 501);
    }
    await this.deps.adapter.react(this.requireSession(), conversationId, messageId, emoji, on);
  }

  /** Replace an already-sent message's body. Write-only, same shape as `react()` — the server echo
   *  (XEP-0308 / Matrix `m.replace`) is what folds the edit into local state via the normal
   *  `ingest()` path, not this method directly. */
  async editMessage(conversationId: string, messageId: string, body: string): Promise<void> {
    if (this.deps.adapter.editMessage === undefined) {
      throw new AppError('this protocol does not support editing messages', 501);
    }
    await this.deps.adapter.editMessage(this.requireSession(), conversationId, messageId, {
      body,
      replyToId: null,
      mediaPath: null,
    });
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
    if (!this.deps.mayEgress()) throw new AppError('chat egress is blocked by the kill-switch', 403);

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

function toLastMessage(message: ChatMessage): ChatConversationLastMessage {
  return {
    protocolId: message.protocolId,
    body: message.body,
    senderAddress: message.senderAddress,
    kind: message.kind,
    redacted: message.redacted,
    originTs: message.originTs,
  };
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
    mutedUntil: null,
    notifyLevel: 'all',
    isKnownContact: false,
    archived: false,
    lastMessage: null,
    updatedAt: 0,
  };
}
