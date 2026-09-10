import type {
  ChatAdapterCaps,
  ChatContact,
  ChatConversation,
  ChatEvent,
  ChatMessage,
} from '@tepegoz/shared-types';
import { normalizeEvent } from './normalize';
import { type ConversationView, emptyConversation, foldEvent, markRead, reconcileEcho } from './conversation';
import { PresenceTracker, type EffectivePresence } from './presence';
import { bareJid, parseJid } from './address';
import { applyOccupant, applySubject, emptyRoom, type RoomOccupantUpdate, type RoomView } from './room';

/**
 * The in-memory aggregate for one connected account: it takes the adapter's **raw** event stream,
 * validates + capability-gates each event (`normalizeEvent`), and folds it into per-conversation
 * views, a roster, and presence. It emits a list of `ChatStateChange`s — the host turns those into
 * `ChatStore` writes and renderer pushes.
 *
 * Pure and synchronous. One instance per account; the host constructs it with the account's self
 * identity and the negotiated adapter caps.
 */

export interface ChatAccountStateOptions {
  accountId: string;
  /** The account's own bare JID / handle — messages from it never count as unread. */
  selfBareJid: string;
  /** Names that ping the user (nick, `@handle`, display name). */
  selfNames: readonly string[];
  caps: ChatAdapterCaps;
  /** Retained message window per conversation. */
  windowLimit?: number;
}

export type ChatStateChange =
  | { kind: 'message'; conversationId: string; message: ChatMessage }
  | { kind: 'message-updated'; conversationId: string; protocolId: string; message: ChatMessage | null }
  | {
      kind: 'conversation'; conversationId: string; unread: number; mentions: number; lastReadId: string | null;
    }
  | { kind: 'roster'; contact: ChatContact; removed: boolean }
  | { kind: 'presence'; address: string; effective: EffectivePresence }
  | { kind: 'typing'; conversationId: string; senderAddress: string; active: boolean }
  | { kind: 'room'; conversationId: string; room: RoomView }
  | { kind: 'dropped'; reason: 'invalid' | 'unsupported-capability' };

export class ChatAccountState {
  private readonly views = new Map<string, ConversationView>();
  private readonly contactsByAddress = new Map<string, ChatContact>();
  private readonly presence = new PresenceTracker();
  private readonly rooms = new Map<string, RoomView>();

  constructor(private readonly opts: ChatAccountStateOptions) {}

  private foldOpts() {
    return {
      selfAddress: this.opts.selfBareJid,
      selfNames: this.opts.selfNames,
      ...(this.opts.windowLimit !== undefined ? { windowLimit: this.opts.windowLimit } : {}),
    };
  }

  private view(conversationId: string): ConversationView {
    let v = this.views.get(conversationId);
    if (v === undefined) {
      v = emptyConversation();
      this.views.set(conversationId, v);
    }
    return v;
  }

  /** Feed one raw adapter event. Returns the resulting state changes (possibly empty). */
  applyRaw(raw: unknown): ChatStateChange[] {
    const { event, dropped } = normalizeEvent(raw, this.opts.caps);
    if (event === null) return dropped === null ? [] : [{ kind: 'dropped', reason: dropped }];
    return this.applyEvent(event);
  }

  applyEvent(event: ChatEvent): ChatStateChange[] {
    switch (event.type) {
      case 'message':
      case 'message-edit':
      case 'message-redact':
      case 'receipt':
      case 'reaction':
        return this.foldConversation(event);
      case 'typing':
        return [
          {
            kind: 'typing',
            conversationId: event.conversationId,
            senderAddress: event.senderAddress,
            active: event.active,
          },
        ];
      case 'presence':
        return this.applyPresence(event.address, event.presence, event.statusText);
      case 'roster-change':
        return this.applyRoster(event.contact, event.removed);
      case 'room-membership':
        return this.applyRoomMembership(event);
      case 'room-topic': {
        const before = this.rooms.get(event.conversationId) ?? emptyRoom();
        const next = applySubject(before, event.topic);
        if (next === before) return [];
        this.rooms.set(event.conversationId, next);
        return [{ kind: 'room', conversationId: event.conversationId, room: next }];
      }
      case 'error':
        return [];
    }
  }

  private applyRoomMembership(
    event: Extract<ChatEvent, { type: 'room-membership' }>,
  ): ChatStateChange[] {
    const nick = parseJid(event.address)?.resource ?? event.address;
    const update: RoomOccupantUpdate = {
      nick,
      realJid: event.realJid,
      affiliation: event.affiliation,
      role: event.role,
      presence: event.joined ? 'online' : 'offline',
      statusText: '',
      self: event.self,
    };
    const next = applyOccupant(this.rooms.get(event.conversationId) ?? emptyRoom(), update);
    this.rooms.set(event.conversationId, next);
    return [{ kind: 'room', conversationId: event.conversationId, room: next }];
  }

  /** The current member/subject view of a joined room, if any. */
  roomView(conversationId: string): RoomView | undefined {
    return this.rooms.get(conversationId);
  }

  private foldConversation(
    event: Extract<
      ChatEvent,
      { type: 'message' | 'message-edit' | 'message-redact' | 'receipt' | 'reaction' }
    >,
  ): ChatStateChange[] {
    const conversationId =
      event.type === 'message' ? event.message.conversationId
      : event.type === 'receipt' ? event.receipt.conversationId
      : event.conversationId;

    const before = this.view(conversationId);
    const after = foldEvent(before, event, this.foldOpts());
    this.views.set(conversationId, after);

    const changes: ChatStateChange[] = [];
    if (event.type === 'message') {
      changes.push({ kind: 'message', conversationId, message: event.message });
    } else if (
      event.type === 'message-edit' ||
      event.type === 'message-redact' ||
      event.type === 'reaction'
    ) {
      const message = after.messages.find((m) => m.protocolId === event.protocolId) ?? null;
      changes.push({ kind: 'message-updated', conversationId, protocolId: event.protocolId, message });
    }
    if (
      after.unread !== before.unread ||
      after.mentions !== before.mentions ||
      after.lastReadId !== before.lastReadId ||
      event.type === 'message'
    ) {
      changes.push({
        kind: 'conversation',
        conversationId,
        unread: after.unread,
        mentions: after.mentions,
        lastReadId: after.lastReadId,
      });
    }
    return changes;
  }

  private applyPresence(address: string, presence: ChatContact['presence'], statusText: string): ChatStateChange[] {
    this.presence.apply(address, presence, statusText);
    const bare = bareJid(address) ?? address;
    const effective = this.presence.effective(bare);
    const contact = this.contactsByAddress.get(bare);
    if (contact !== undefined && contact.presence !== effective.presence) {
      this.contactsByAddress.set(bare, {
        ...contact,
        presence: effective.presence,
        statusText: effective.statusText,
      });
    }
    return [{ kind: 'presence', address: bare, effective }];
  }

  private applyRoster(contact: ChatContact, removed: boolean): ChatStateChange[] {
    if (removed) {
      this.contactsByAddress.delete(contact.address);
    } else {
      const eff = this.presence.effective(contact.address);
      this.contactsByAddress.set(contact.address, {
        ...contact,
        presence: eff.presence,
        statusText: eff.statusText,
      });
    }
    return [{ kind: 'roster', contact, removed }];
  }

  /** Record an optimistic local send; returns the message to display immediately. */
  echoLocalSend(message: ChatMessage): ChatStateChange[] {
    const after = foldEvent(this.view(message.conversationId), { type: 'message', message }, this.foldOpts());
    this.views.set(message.conversationId, after);
    return [{ kind: 'message', conversationId: message.conversationId, message }];
  }

  /** Reconcile an echo once the server acks it with its real protocol id. */
  reconcileSend(conversationId: string, tempId: string, serverMessage: ChatMessage): ChatStateChange[] {
    const after = reconcileEcho(this.view(conversationId), tempId, serverMessage);
    this.views.set(conversationId, after);
    return [
      { kind: 'message-updated', conversationId, protocolId: tempId, message: serverMessage },
    ];
  }

  /** Mark a conversation read up to `protocolId`. */
  markConversationRead(conversationId: string, protocolId: string): ChatStateChange[] {
    const before = this.view(conversationId);
    const after = markRead(before, protocolId, this.foldOpts());
    this.views.set(conversationId, after);
    if (after === before) return [];
    return [
      {
        kind: 'conversation',
        conversationId,
        unread: after.unread,
        mentions: after.mentions,
        lastReadId: after.lastReadId,
      },
    ];
  }

  /** Seed a conversation window from a MAM history page (oldest-first). */
  seedHistory(conversationId: string, messages: readonly ChatMessage[]): ChatStateChange[] {
    let v = this.view(conversationId);
    for (const message of messages) {
      v = foldEvent(v, { type: 'message', message }, this.foldOpts());
    }
    this.views.set(conversationId, v);
    return messages.map((message) => ({ kind: 'message', conversationId, message }));
  }

  conversationView(conversationId: string): ConversationView {
    return this.view(conversationId);
  }

  roster(): ChatContact[] {
    return [...this.contactsByAddress.values()];
  }

  effectivePresence(address: string): EffectivePresence {
    return this.presence.effective(address);
  }

  /** The conversations that have any local state (for a "list conversations" projection). */
  conversationIds(): string[] {
    return [...this.views.keys()];
  }

  toConversationSummaries(existing: ReadonlyMap<string, ChatConversation>): ChatConversation[] {
    const out: ChatConversation[] = [];
    for (const [id, view] of this.views) {
      const base = existing.get(id);
      if (base === undefined) continue;
      out.push({ ...base, unread: view.unread, mentions: view.mentions, lastReadId: view.lastReadId });
    }
    return out;
  }
}
