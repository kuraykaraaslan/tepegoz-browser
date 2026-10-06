import type { ChatConversation, ChatMessage } from '@tepegoz/shared-types';
import type { ChatStateChange } from '@tepegoz/chat-core';
import type { ChatRunnerStore } from './account-runner-types';
import { blankConversation, toLastMessage } from './account-runner-helpers';

/**
 * The store-facing half of `ChatAccountRunner`: persisting a folded state change, keeping the
 * conversation list's preview row honest, and the local-only conversation flags. Free functions over
 * the injected `ChatRunnerStore`, so the runner class keeps only the lifecycle / session / protocol
 * glue.
 */

/** `chat_messages.conversation_id` is a foreign key onto `chat_conversations` — a message for a
 *  conversation that has no row yet (a DM's very first-ever message, before any `conversation`
 *  fold or explicit open) would otherwise violate it and crash the whole event pump into a
 *  reconnect loop that hits the exact same missing row again. Same shape as the `'room'` case
 *  in `persistChange` (found first, for Matrix's passive room discovery); DMs need the identical guard because
 *  `foldConversation`'s `'message'` change is emitted and applied BEFORE its paired `'conversation'`
 *  change reaches here, so that one is too late to rely on. */
export function ensureConversation(
  store: ChatRunnerStore,
  accountId: string,
  now: () => number,
  conversationId: string,
): void {
  if (store.getConversation(conversationId) === null) {
    store.upsertConversation({
      ...blankConversation(accountId, conversationId),
      updatedAt: now(),
    });
  }
}

/** Refresh the conversation list's preview row. Never regresses it: MAM/history catch-up can
 *  deliver a live 'message' event for something OLDER than what's already shown (out-of-order
 *  reconnect catch-up), so this only advances `lastMessage` when the arriving message is at least
 *  as new as what's stored. Called AFTER `ensureConversation`, so the row always exists here. */
function bumpLastMessage(store: ChatRunnerStore, message: ChatMessage): void {
  const conv = store.getConversation(message.conversationId);
  if (conv === null) return;
  if (conv.lastMessage !== null && message.originTs < conv.lastMessage.originTs) return;
  store.upsertConversation({ ...conv, lastMessage: toLastMessage(message) });
}

/** An edit (XEP-0308 / `m.replace`) only needs to touch the preview row when it lands on the
 *  message the preview is CURRENTLY showing — an edit to some older message further up the
 *  timeline should not resurrect it as the "latest" one. */
function refreshLastMessageIfCurrent(store: ChatRunnerStore, message: ChatMessage): void {
  const conv = store.getConversation(message.conversationId);
  if (conv === null || conv.lastMessage?.protocolId !== message.protocolId) return;
  store.upsertConversation({ ...conv, lastMessage: toLastMessage(message) });
}

/** A redaction of the message the preview is currently showing needs the same in-place refresh —
 *  `redactMessage` already flipped the stored row itself; this just re-reads it into the preview
 *  so the list shows "Message deleted" instead of the pre-redaction text. */
function redactLastMessageIfCurrent(
  store: ChatRunnerStore,
  conversationId: string,
  protocolId: string,
): void {
  const conv = store.getConversation(conversationId);
  if (conv === null || conv.lastMessage?.protocolId !== protocolId) return;
  store.upsertConversation({
    ...conv,
    lastMessage: { ...conv.lastMessage, body: '', redacted: true },
  });
}

/** Persist one folded state change (the store half of the runner's `applyChange`). `onMessage` runs
 *  for a freshly arrived message AFTER it is stored and the preview bumped — the runner's
 *  notification hook. */
export function persistChange(
  store: ChatRunnerStore,
  accountId: string,
  now: () => number,
  change: ChatStateChange,
  onMessage: (message: ChatMessage) => void,
): void {
  switch (change.kind) {
    case 'message':
      ensureConversation(store, accountId, now, change.message.conversationId);
      store.upsertMessage(change.message);
      bumpLastMessage(store, change.message);
      onMessage(change.message);
      break;
    case 'message-updated':
      if (change.message === null || change.message.redacted) {
        const protocolId = change.message?.protocolId ?? change.protocolId;
        store.redactMessage(change.conversationId, protocolId);
        redactLastMessageIfCurrent(store, change.conversationId, protocolId);
      } else {
        ensureConversation(store, accountId, now, change.message.conversationId);
        store.upsertMessage(change.message);
        refreshLastMessageIfCurrent(store, change.message);
      }
      break;
    case 'conversation': {
      const base =
        store.getConversation(change.conversationId) ??
        blankConversation(accountId, change.conversationId);
      store.upsertConversation({
        ...base,
        unread: change.unread,
        mentions: change.mentions,
        lastReadId: change.lastReadId,
        updatedAt: now(),
      });
      break;
    }
    case 'roster':
      if (!change.removed) store.upsertContact(change.contact);
      break;
    case 'room': {
      const base = store.getConversation(change.conversationId);
      if (base === null) {
        // A room-membership fold fires for a room Tepegöz never explicitly joined too — Matrix
        // reports every room the account is already a member of on its very first `/sync`, with
        // no `joinRoom()` call in between. Without a conversation row here, the FIRST message
        // event for that room (same sync, or any later one) violates `chat_messages`' foreign key
        // on `conversation_id` — which crashes the whole event pump and forces a full reconnect,
        // which re-syncs from scratch and hits the exact same missing row again: an account with
        // any pre-existing Matrix room history could never get past its own initial sync.
        store.upsertConversation({
          ...blankConversation(accountId, change.conversationId),
          kind: 'room',
          name: change.conversationId,
          topic: change.room.subject,
          updatedAt: now(),
        });
        break;
      }
      // The occupant view is renderer-only, but a topic change is persisted onto the
      // conversation row so it survives a reload (and feeds the header's stored-topic fallback).
      if (change.room.subject !== base.topic) {
        store.upsertConversation({
          ...base,
          topic: change.room.subject,
          updatedAt: now(),
        });
      }
      break;
    }
    case 'presence':
    case 'typing':
    case 'dropped':
      break;
  }
}

function existingOrBlank(
  store: ChatRunnerStore,
  accountId: string,
  conversationId: string,
): ChatConversation {
  return store.getConversation(conversationId) ?? blankConversation(accountId, conversationId);
}

export function setNotifyLevel(
  store: ChatRunnerStore,
  accountId: string,
  conversationId: string,
  level: 'all' | 'mentions' | 'none',
): void {
  store.upsertConversation({
    ...existingOrBlank(store, accountId, conversationId),
    notifyLevel: level,
  });
}

/** The forever mute — always clears any TIMED mute too, so switching between the two never leaves
 *  the other one's state stale (a leftover `mutedUntil` from a previous timed mute must not silently
 *  reactivate once `muted` is later turned back off). */
export function setMutedFlag(
  store: ChatRunnerStore,
  accountId: string,
  conversationId: string,
  muted: boolean,
): void {
  store.upsertConversation({
    ...existingOrBlank(store, accountId, conversationId),
    muted,
    mutedUntil: null,
  });
}

/** A timed mute — `durationMs: null` means forever (same effect as `setMutedFlag(true)`, through the
 *  same field, so there is only ever one "is this forever-muted" bit to check). */
export function muteConversationFor(
  store: ChatRunnerStore,
  accountId: string,
  now: () => number,
  conversationId: string,
  durationMs: number | null,
): void {
  const existing = existingOrBlank(store, accountId, conversationId);
  store.upsertConversation(
    durationMs === null
      ? { ...existing, muted: true, mutedUntil: null }
      : { ...existing, muted: false, mutedUntil: now() + durationMs },
  );
}

/** Archiving is a purely local presentation flag — no protocol has a matching wire concept, and it
 *  does not affect delivery, unread counting, or anything else: an archived conversation still
 *  receives messages exactly as before, it just starts out of the default list. */
export function setArchivedFlag(
  store: ChatRunnerStore,
  accountId: string,
  conversationId: string,
  archived: boolean,
): void {
  store.upsertConversation({
    ...existingOrBlank(store, accountId, conversationId),
    archived,
  });
}
