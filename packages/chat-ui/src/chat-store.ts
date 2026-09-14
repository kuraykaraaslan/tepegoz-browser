import type { ChatStateChange, RoomView } from '@tepegoz/chat-core';
import type { ChatContact, ChatConversation, ChatMessage } from '@tepegoz/shared-types';

/**
 * The renderer's in-memory projection of one account's chat state. Main does the protocol work and
 * pushes already-folded {@link ChatStateChange}s over `chat:state`; this reducer keeps the panel's
 * view of conversations, roster, open-conversation messages and typing in sync. Pure and immutable —
 * every `apply*` returns a new object (or the same one when nothing changed) so React bails cheaply.
 */

export interface ChatClientState {
  /** Conversation rows, by id — seeded from `listChatConversations`, patched by change events. */
  readonly conversations: Readonly<Record<string, ChatConversation>>;
  /** Roster contacts, by contact id — seeded from `getChatRoster`, patched by roster/presence events. */
  readonly roster: Readonly<Record<string, ChatContact>>;
  /** Windowed, ordered message lists by conversation id — seeded on open, appended by message events. */
  readonly messages: Readonly<Record<string, readonly ChatMessage[]>>;
  /** Sender addresses currently typing, by conversation id. */
  readonly typing: Readonly<Record<string, readonly string[]>>;
  /** MUC room views (occupants + subject + joined), by conversation id. */
  readonly rooms: Readonly<Record<string, RoomView>>;
}

export function emptyChatClientState(): ChatClientState {
  return { conversations: {}, roster: {}, messages: {}, typing: {}, rooms: {} };
}

const byId = <T extends { id: string }>(rows: readonly T[]): Record<string, T> =>
  Object.fromEntries(rows.map((r) => [r.id, r]));

export function seedConversations(
  state: ChatClientState,
  conversations: readonly ChatConversation[],
): ChatClientState {
  return { ...state, conversations: byId(conversations) };
}

export function seedRoster(state: ChatClientState, contacts: readonly ChatContact[]): ChatClientState {
  return { ...state, roster: byId(contacts) };
}

/** Merge fields into one conversation row (optimistic local edits — mute, notify level). */
export function patchConversation(
  state: ChatClientState,
  conversationId: string,
  patch: Partial<ChatConversation>,
): ChatClientState {
  const existing = state.conversations[conversationId];
  if (existing === undefined) return state;
  return {
    ...state,
    conversations: { ...state.conversations, [conversationId]: { ...existing, ...patch } },
  };
}

/**
 * Optimistically flip the local user's reaction on one loaded message — the server echo (a folded
 * `reaction` change, or a fresh history read) is the source of truth and will settle over this.
 * No-op when the conversation's messages are not loaded or the message is not in the loaded window.
 */
export function toggleReaction(
  state: ChatClientState,
  conversationId: string,
  protocolId: string,
  emoji: string,
  on: boolean,
): ChatClientState {
  const list = state.messages[conversationId];
  if (list === undefined) return state;
  const idx = list.findIndex((m) => m.protocolId === protocolId);
  if (idx === -1) return state;
  const message = list[idx];
  if (message === undefined) return state;

  const reactions = on
    ? message.reactions.some((r) => r.emoji === emoji)
      ? message.reactions.map((r) =>
          r.emoji === emoji && !r.me ? { ...r, count: r.count + 1, me: true } : r,
        )
      : [...message.reactions, { emoji, count: 1, me: true }]
    : message.reactions
        .map((r) => (r.emoji === emoji && r.me ? { ...r, count: r.count - 1, me: false } : r))
        .filter((r) => r.count > 0);

  const nextList = [...list];
  nextList[idx] = { ...message, reactions };
  return { ...state, messages: { ...state.messages, [conversationId]: nextList } };
}

function orderMessages(list: readonly ChatMessage[]): ChatMessage[] {
  return [...list].sort(
    (a, b) =>
      a.originTs - b.originTs ||
      a.receivedAt - b.receivedAt ||
      (a.protocolId < b.protocolId ? -1 : a.protocolId > b.protocolId ? 1 : 0),
  );
}

export function seedHistory(
  state: ChatClientState,
  conversationId: string,
  history: readonly ChatMessage[],
): ChatClientState {
  const existing = state.messages[conversationId] ?? [];
  const merged = new Map<string, ChatMessage>();
  for (const m of history) merged.set(m.protocolId, m);
  for (const m of existing) merged.set(m.protocolId, m);
  return {
    ...state,
    messages: { ...state.messages, [conversationId]: orderMessages([...merged.values()]) },
  };
}

function upsertMessage(
  list: readonly ChatMessage[],
  message: ChatMessage,
): readonly ChatMessage[] {
  const idx = list.findIndex((m) => m.protocolId === message.protocolId);
  if (idx >= 0) {
    const next = [...list];
    next[idx] = message;
    return next;
  }
  return orderMessages([...list, message]);
}

export function applyChatChange(state: ChatClientState, change: ChatStateChange): ChatClientState {
  switch (change.kind) {
    case 'message': {
      const list = state.messages[change.conversationId];
      // Only track messages for a conversation the panel has opened (its window is seeded).
      if (list === undefined) return bumpConversation(state, change.conversationId, change.message);
      return bumpConversation(
        { ...state, messages: { ...state.messages, [change.conversationId]: upsertMessage(list, change.message) } },
        change.conversationId,
        change.message,
      );
    }
    case 'message-updated': {
      const list = state.messages[change.conversationId];
      if (list === undefined) return state;
      const updated = change.message;
      const next =
        updated === null
          ? list.filter((m) => m.protocolId !== change.protocolId)
          : list.map((m) => (m.protocolId === change.protocolId ? updated : m));
      return { ...state, messages: { ...state.messages, [change.conversationId]: next } };
    }
    case 'conversation': {
      // A no-op for an unknown id is safe here specifically because `chat-core`'s `foldConversation`
      // always emits a 'conversation' change together with (never before) the 'message' change for
      // any event that could introduce a brand-new conversation — and `bumpConversation` below
      // creates the stub row first. There is no accountId on this change to build one here directly.
      const existing = state.conversations[change.conversationId];
      if (existing === undefined) return state;
      return {
        ...state,
        conversations: {
          ...state.conversations,
          [change.conversationId]: {
            ...existing,
            unread: change.unread,
            mentions: change.mentions,
            lastReadId: change.lastReadId,
          },
        },
      };
    }
    case 'roster': {
      const roster = { ...state.roster };
      if (change.removed) delete roster[change.contact.id];
      else roster[change.contact.id] = change.contact;
      return { ...state, roster };
    }
    case 'presence': {
      let touched = false;
      const roster = { ...state.roster };
      for (const [id, contact] of Object.entries(state.roster)) {
        if (contact.address !== change.address) continue;
        roster[id] = {
          ...contact,
          presence: change.effective.presence,
          statusText: change.effective.statusText,
        };
        touched = true;
      }
      return touched ? { ...state, roster } : state;
    }
    case 'typing': {
      const current = state.typing[change.conversationId] ?? [];
      const has = current.includes(change.senderAddress);
      if (change.active === has) return state;
      const next = change.active
        ? [...current, change.senderAddress]
        : current.filter((a) => a !== change.senderAddress);
      return { ...state, typing: { ...state.typing, [change.conversationId]: next } };
    }
    case 'room':
      return { ...state, rooms: { ...state.rooms, [change.conversationId]: change.room } };
    case 'dropped':
      return state;
  }
}

/** Nudge a conversation's `updatedAt` (and its stub, if we have no row) so the list reorders. */
/** A conversation row good enough to render and open, for a live push that named a conversation
 *  this client has never seen before (most commonly: the first-ever message from a contact with no
 *  prior history) — the real row (name, topic, member count, …) arrives on the next full
 *  `listChatConversations` seed (account switch, reload); until then this is strictly better than
 *  the message silently vanishing from the UI, which is what happened before this existed. Mirrors
 *  `apps/desktop/src/main/chat/account-runner.ts`'s `blankConversation` fallback for the same gap
 *  on the store side. */
function stubConversation(conversationId: string, accountId: string): ChatConversation {
  return {
    id: conversationId,
    accountId,
    kind: conversationId.includes('/') ? 'room' : 'dm',
    address: conversationId,
    name: conversationId,
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

function bumpConversation(
  state: ChatClientState,
  conversationId: string,
  message: ChatMessage,
): ChatClientState {
  const existing = state.conversations[conversationId] ?? stubConversation(conversationId, message.accountId);
  const at = message.receivedAt || message.originTs;
  if (at <= existing.updatedAt) return state;
  return {
    ...state,
    conversations: {
      ...state.conversations,
      [conversationId]: {
        ...existing,
        updatedAt: at,
        lastMessage: {
          protocolId: message.protocolId,
          body: message.body,
          senderAddress: message.senderAddress,
          kind: message.kind,
          redacted: message.redacted,
          originTs: message.originTs,
        },
      },
    },
  };
}

export function applyChatChanges(
  state: ChatClientState,
  changes: readonly ChatStateChange[],
): ChatClientState {
  return changes.reduce(applyChatChange, state);
}
