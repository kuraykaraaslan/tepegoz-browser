import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ChatConnState, RoomNotifyLevel } from '@tepegoz/chat-core';
import type { ChatConversation } from '@tepegoz/shared-types';
import {
  applyChatChange,
  emptyChatClientState,
  patchConversation,
  seedConversations,
  seedHistory,
  seedRoster,
  toggleReaction,
  type ChatClientState,
} from './chat-store';
import { sortConversations } from './conversation-list';
import type { ChatAccountSummary, ChatClientPort } from './types';
import type { RoomListing } from './room-browser';

export interface UseChatState {
  accounts: readonly ChatAccountSummary[];
  connectionStates: Readonly<Record<string, ChatConnState>>;
  activeAccountId: string | null;
  setActiveAccount: (accountId: string) => void;
  /** Remove a configured account — `null` when the port does not support it. */
  removeAccount: ((accountId: string) => Promise<void>) | null;
  client: ChatClientState;
  /** Conversations of the active account, most-recent first. */
  conversations: readonly ChatConversation[];
  selectedConversationId: string | null;
  selectConversation: (conversationId: string | null) => void;
  /** True until the first accounts + conversations load resolves. */
  loading: boolean;
  send: (text: string, opts?: { replyToId?: string | null }) => Promise<void>;
  /** Change a room's notification level — `null` when the port does not support it. */
  setRoomNotifyLevel: ((conversationId: string, level: RoomNotifyLevel) => Promise<void>) | null;
  /** Mute / unmute a conversation — `null` when the port does not support it. */
  setMuted: ((conversationId: string, muted: boolean) => Promise<void>) | null;
  /** Change a room's topic — `null` when the port does not support it. */
  setRoomTopic: ((conversationId: string, topic: string) => Promise<void>) | null;
  /** Invite a contact to a room — `null` when the port does not support it. */
  inviteToRoom: ((conversationId: string, invitee: string) => Promise<void>) | null;
  /** Add a contact to the roster — `null` when the port does not support it (or the protocol has
   *  no roster/subscription concept at all). */
  addContact: ((address: string) => Promise<void>) | null;
  /** Remove a contact from the roster — `null` for the same reason as {@link addContact}. */
  removeContact: ((address: string) => Promise<void>) | null;
  /** Leave a joined room — `null` when the port does not support it. */
  leaveRoom: ((conversationId: string) => Promise<void>) | null;
  /** Add / remove one of the local user's emoji reactions on a message — `null` when the port does
   *  not support it. `protocolId` addresses the message. */
  react:
    | ((conversationId: string, protocolId: string, emoji: string, on: boolean) => Promise<void>)
    | null;
  refresh: () => Promise<void>;
  /** MUC — present only when the port supports rooms. */
  rooms:
    | {
        discover: (service: string) => Promise<RoomListing[]>;
        join: (roomJid: string) => Promise<void>;
      }
    | null;
}

/**
 * Binds a {@link ChatClientPort} (the desktop bridge, or a fake in tests) to a live view: accounts and
 * their connection state, the active account's conversations, and the open conversation's message
 * window. Main computes every fold and pushes it over `onChatState`; this hook just seeds from the
 * reads and applies the changes.
 */
export function useChatState(port: ChatClientPort): UseChatState {
  const [accounts, setAccounts] = useState<readonly ChatAccountSummary[]>([]);
  const [connectionStates, setConnectionStates] = useState<Record<string, ChatConnState>>({});
  const [activeAccountId, setActiveAccountId] = useState<string | null>(null);
  const [client, setClient] = useState<ChatClientState>(emptyChatClientState);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const seededConversations = useRef(false);

  const refresh = useCallback(async (): Promise<void> => {
    const snapshot = await port.listChatAccounts();
    const sorted = [...snapshot.accounts].sort((a, b) => a.order - b.order);
    setAccounts(sorted);
    setConnectionStates(snapshot.states);
    setActiveAccountId((current) => current ?? sorted[0]?.id ?? null);
  }, [port]);

  // Initial load.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await refresh();
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  // Whenever the active account changes, (re)seed its conversations + roster.
  useEffect(() => {
    if (activeAccountId === null) return;
    let cancelled = false;
    seededConversations.current = false;
    void (async () => {
      const [conversations, roster] = await Promise.all([
        port.listChatConversations(activeAccountId),
        port.getChatRoster(activeAccountId),
      ]);
      if (cancelled) return;
      setClient((prev) => seedRoster(seedConversations(prev, conversations), roster));
      seededConversations.current = true;
    })();
    return () => {
      cancelled = true;
    };
  }, [port, activeAccountId]);

  // Subscribe to the main→renderer push for the lifetime of the hook.
  useEffect(() => {
    return port.onChatState((event) => {
      if (event.kind === 'state') {
        setConnectionStates((prev) => ({ ...prev, [event.accountId]: event.state }));
      } else {
        setClient((prev) => applyChatChange(prev, event.change));
      }
    });
  }, [port]);

  const selectConversation = useCallback(
    (conversationId: string | null): void => {
      setSelectedConversationId(conversationId);
      if (conversationId === null || activeAccountId === null) return;
      if (client.messages[conversationId] !== undefined) return;
      // Mark this conversation as tracked BEFORE the history fetch resolves, not after —
      // `chat-store`'s `applyChatChange` only folds a live 'message' event into a conversation
      // whose window is already seeded (`state.messages[id] !== undefined`) so it never grows the
      // set of tracked conversations unbounded. Seeding with `[]` synchronously closes the race
      // where a message sent (or received) right after opening a brand-new conversation arrives
      // before `getChatHistory` resolves and would otherwise be silently dropped from the timeline
      // (the conversation's unread badge still bumps either way, since that fold path doesn't
      // check the window) — `seedHistory` merges by `protocolId`, so the later real page's messages
      // combine with whatever arrived in the interim instead of overwriting it.
      setClient((prev) => seedHistory(prev, conversationId, []));
      void (async () => {
        const page = await port.getChatHistory(activeAccountId, conversationId);
        setClient((prev) => seedHistory(prev, conversationId, page.messages));
        const newest = page.messages.at(-1);
        if (newest !== undefined) {
          await port.markChatRead(activeAccountId, conversationId, newest.protocolId);
        }
      })();
    },
    [port, activeAccountId, client.messages],
  );

  const send = useCallback(
    async (text: string, opts?: { replyToId?: string | null }): Promise<void> => {
      if (activeAccountId === null || selectedConversationId === null) return;
      const { protocolId } = await port.sendChatMessage(activeAccountId, selectedConversationId, {
        body: text,
        replyToId: opts?.replyToId ?? null,
        mediaPath: null,
      });
      // Your own message must never land past the "new messages" divider — without this, the
      // timeline's `lastReadId` stays at whatever it was before you typed, so `buildTimeline` reads
      // the message you JUST sent as unread and draws the divider above it.
      await port.markChatRead(activeAccountId, selectedConversationId, protocolId);
    },
    [port, activeAccountId, selectedConversationId],
  );

  const setActiveAccount = useCallback((accountId: string): void => {
    setActiveAccountId(accountId);
    setSelectedConversationId(null);
  }, []);

  const { removeChatAccount } = port;
  const removeAccount = useMemo(() => {
    if (removeChatAccount === undefined) return null;
    return async (accountId: string): Promise<void> => {
      await removeChatAccount(accountId);
      // Drop a stale active-account pointer so `refresh` picks the next available account instead
      // of leaving the panel wired to an id that no longer exists.
      if (activeAccountId === accountId) {
        setActiveAccountId(null);
        setSelectedConversationId(null);
      }
      await refresh();
    };
  }, [removeChatAccount, activeAccountId, refresh]);

  const { setChatRoomNotifyLevel } = port;
  const setRoomNotifyLevel = useMemo(() => {
    if (setChatRoomNotifyLevel === undefined) return null;
    return async (conversationId: string, level: RoomNotifyLevel): Promise<void> => {
      if (activeAccountId === null) return;
      setClient((prev) => patchConversation(prev, conversationId, { notifyLevel: level }));
      await setChatRoomNotifyLevel(activeAccountId, conversationId, level);
    };
  }, [setChatRoomNotifyLevel, activeAccountId]);

  const { setChatMuted } = port;
  const setMuted = useMemo(() => {
    if (setChatMuted === undefined) return null;
    return async (conversationId: string, muted: boolean): Promise<void> => {
      if (activeAccountId === null) return;
      setClient((prev) => patchConversation(prev, conversationId, { muted }));
      await setChatMuted(activeAccountId, conversationId, muted);
    };
  }, [setChatMuted, activeAccountId]);

  const { setChatRoomTopic } = port;
  const setRoomTopic = useMemo(() => {
    if (setChatRoomTopic === undefined) return null;
    return async (conversationId: string, topic: string): Promise<void> => {
      if (activeAccountId === null) return;
      // No optimistic patch — the server echo (`room-topic`) is the source of truth for the subject.
      await setChatRoomTopic(activeAccountId, conversationId, topic);
    };
  }, [setChatRoomTopic, activeAccountId]);

  const { reactToChatMessage } = port;
  const react = useMemo(() => {
    if (reactToChatMessage === undefined) return null;
    return async (
      conversationId: string,
      protocolId: string,
      emoji: string,
      on: boolean,
    ): Promise<void> => {
      if (activeAccountId === null) return;
      // Optimistic — reverted implicitly if the round trip throws (the caller sees the rejection
      // and, per the shared error-boundary convention, surfaces it; there is no retry queue here).
      setClient((prev) => toggleReaction(prev, conversationId, protocolId, emoji, on));
      await reactToChatMessage(activeAccountId, conversationId, protocolId, emoji, on);
    };
  }, [reactToChatMessage, activeAccountId]);

  const { inviteToChatRoom } = port;
  const inviteToRoom = useMemo(() => {
    if (inviteToChatRoom === undefined) return null;
    return async (conversationId: string, invitee: string): Promise<void> => {
      if (activeAccountId === null) return;
      // Write-only — a resulting membership change arrives on `chat:state`.
      await inviteToChatRoom(activeAccountId, conversationId, invitee);
    };
  }, [inviteToChatRoom, activeAccountId]);

  const { addChatContact } = port;
  const addContact = useMemo(() => {
    if (addChatContact === undefined) return null;
    return async (address: string): Promise<void> => {
      if (activeAccountId === null) return;
      // Write-only, same as inviteToRoom — the roster-change push (the server's roster-push, then
      // again once the subscription is approved) is what actually updates `client.roster`.
      await addChatContact(activeAccountId, address);
    };
  }, [addChatContact, activeAccountId]);

  const { removeChatContact } = port;
  const removeContact = useMemo(() => {
    if (removeChatContact === undefined) return null;
    return async (address: string): Promise<void> => {
      if (activeAccountId === null) return;
      // Write-only, same as addContact — the server's roster-push (subscription now "remove") is
      // what actually updates `client.roster`.
      await removeChatContact(activeAccountId, address);
    };
  }, [removeChatContact, activeAccountId]);

  const { leaveChatRoom } = port;
  const leaveRoom = useMemo(() => {
    if (leaveChatRoom === undefined) return null;
    return async (conversationId: string): Promise<void> => {
      if (activeAccountId === null) return;
      await leaveChatRoom(activeAccountId, conversationId);
      // The panel has no business staying open on a room the user just walked out of.
      setSelectedConversationId((current) => (current === conversationId ? null : current));
      const conversations = await port.listChatConversations(activeAccountId);
      setClient((prev) => seedConversations(prev, conversations));
    };
  }, [leaveChatRoom, activeAccountId, port]);

  const conversations = useMemo(() => {
    if (activeAccountId === null) return [];
    return sortConversations(
      Object.values(client.conversations).filter((c) => c.accountId === activeAccountId),
    );
  }, [client.conversations, activeAccountId]);

  const { discoverChatRooms, joinChatRoom } = port;
  const rooms = useMemo(() => {
    if (discoverChatRooms === undefined || joinChatRoom === undefined) return null;
    return {
      discover: (service: string): Promise<RoomListing[]> =>
        activeAccountId === null
          ? Promise.resolve([])
          : discoverChatRooms(activeAccountId, service),
      join: async (roomJid: string): Promise<void> => {
        if (activeAccountId === null) return;
        // The adapter's own idea of the room's id (bare-JID-normalized) is the source of truth —
        // it is what every later push event keys its patches against, so falling back to the raw
        // input here would silently orphan the conversation the moment the two diverge.
        const conversationId = (await joinChatRoom(activeAccountId, roomJid)) ?? roomJid;
        // `applyChatChange`'s 'conversation' case only patches a row that already exists (see
        // chat-store.ts) — a freshly joined room has no row yet, so an explicit re-seed is the only
        // way the panel learns about it before selecting it.
        const conversations = await port.listChatConversations(activeAccountId);
        setClient((prev) => seedConversations(prev, conversations));
        selectConversation(conversationId);
      },
    };
  }, [discoverChatRooms, joinChatRoom, activeAccountId, port, selectConversation]);

  return {
    accounts,
    connectionStates,
    activeAccountId,
    setActiveAccount,
    removeAccount,
    client,
    conversations,
    selectedConversationId,
    selectConversation,
    loading,
    send,
    setRoomNotifyLevel,
    setMuted,
    setRoomTopic,
    inviteToRoom,
    addContact,
    removeContact,
    leaveRoom,
    react,
    refresh,
    rooms,
  };
}
