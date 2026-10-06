import { AppError } from '@tepegoz/libs';
import type { ChatContact, ChatMessage } from '@tepegoz/shared-types';
import type { ChatSession, RoomSummary } from '@tepegoz/chat-adapters';
import {
  ChatAccountState,
  ChatConnectionManager,
  type ChatConnState,
  type ChatStateChange,
} from '@tepegoz/chat-core';
import {
  buildNotification,
  buildOptimisticMessage,
  deriveBareJid,
  fetchMediaDataUrl,
  selfNames,
} from './account-runner-helpers';
import {
  muteConversationFor,
  persistChange,
  setArchivedFlag,
  setMutedFlag,
  setNotifyLevel,
} from './account-runner-store-ops';
import {
  hashConversationId,
  type AccountRunnerDeps,
  type ChatAuditEvent,
  type ChatNotification,
  type ChatRunnerStore,
  type RunnerEmit,
} from './account-runner-types';

// The runner's public surface lives in `account-runner-types.ts`; re-exported so every existing
// `from './account-runner'` import keeps resolving.
export { hashConversationId };
export type { AccountRunnerDeps, ChatAuditEvent, ChatNotification, ChatRunnerStore, RunnerEmit };

/**
 * One account's worth of live chat: the adapter's raw event stream folded into per-conversation
 * state and persisted, plus the send / presence / history / roster methods. The reconnect lifecycle
 * and the kill-switch are `ChatConnectionManager`'s job; this is the glue between it, the fold
 * (`ChatAccountState`) and the store.
 *
 * IO-free by injection: the store, adapter, transport, clock and timers are all supplied by
 * `ChatService`, so this is unit-tested against fakes.
 */

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

  private applyChange(change: ChatStateChange): void {
    persistChange(this.deps.store, this.accountId, this.deps.now, change, (message) =>
      this.maybeNotify(message),
    );
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
    if (this.deps.notify === undefined) return;
    const notification = buildNotification({
      accountId: this.accountId,
      message,
      conversation: this.deps.store.getConversation(message.conversationId),
      fromSelf: this.isFromSelf(message),
      selfNames: this.selfNames,
    });
    if (notification !== null) this.deps.notify(notification);
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
    const temp = buildOptimisticMessage(
      this.deps.account,
      tempId,
      conversationId,
      body,
      mediaRef,
      this.deps.now,
    );
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
    const settled: ChatMessage = {
      ...temp,
      id: receipt.protocolId,
      protocolId: receipt.protocolId,
      deliveryState: 'sent',
    };
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
    if (conv !== null)
      this.deps.store.upsertConversation({ ...conv, isKnownContact: false, unread: 0 });
  }

  setRoomNotifyLevel(conversationId: string, level: 'all' | 'mentions' | 'none'): Promise<void> {
    setNotifyLevel(this.deps.store, this.accountId, conversationId, level);
    return Promise.resolve();
  }

  /** The forever mute — also clears any TIMED mute; see `setMutedFlag`. */
  setMuted(conversationId: string, muted: boolean): Promise<void> {
    setMutedFlag(this.deps.store, this.accountId, conversationId, muted);
    return Promise.resolve();
  }

  /** A timed mute — `durationMs: null` means forever; see `muteConversationFor`. */
  muteFor(conversationId: string, durationMs: number | null): Promise<void> {
    muteConversationFor(this.deps.store, this.accountId, this.deps.now, conversationId, durationMs);
    return Promise.resolve();
  }

  /** Archiving is a purely local presentation flag; see `setArchivedFlag`. */
  setArchived(conversationId: string, archived: boolean): Promise<void> {
    setArchivedFlag(this.deps.store, this.accountId, conversationId, archived);
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
    if (
      this.deps.adapter.blockContact === undefined ||
      this.deps.adapter.unblockContact === undefined
    ) {
      throw new AppError('this protocol has no server-side blocking concept', 501);
    }
    if (blocked) {
      await this.deps.adapter.blockContact(this.requireSession(), address);
    } else {
      await this.deps.adapter.unblockContact(this.requireSession(), address);
    }
    this.deps.store.setContactBlocked(this.accountId, address, blocked);
  }

  async react(
    conversationId: string,
    messageId: string,
    emoji: string,
    on: boolean,
  ): Promise<void> {
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
   * Resolve a message `mediaRef` to a quarantined `data:` URL — see `fetchMediaDataUrl`. `null` when
   * the protocol has no media repo, the ref is malformed, the download fails, or it is over the cap.
   */
  async resolveMedia(mediaRef: string): Promise<{ dataUrl: string } | null> {
    if (this.deps.adapter.resolveMedia === undefined) return null;
    return fetchMediaDataUrl(
      this.deps.adapter,
      this.deps.transport,
      this.deps.mayEgress,
      this.requireSession(),
      mediaRef,
    );
  }
}
