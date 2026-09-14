import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ChatConnState, RoomNotifyLevel } from '@tepegoz/chat-core';
import type { ChatConversation } from '@tepegoz/shared-types';
import {
  applyChatChange,
  emptyChatClientState,
  patchContact,
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
  /** Conversations across every configured account, most-recent first. */
  conversations: readonly ChatConversation[];
  selectedConversationId: string | null;
  /** `hintAccountId`: which account a not-yet-existing conversation belongs to — only used as a
   *  fallback when the id names no known row yet (starting a DM with a room member or a contact
   *  never messaged before). Ignored once the conversation has a real row. */
  selectConversation: (conversationId: string | null, hintAccountId?: string) => void;
  /** True until the first accounts + conversations load resolves. */
  loading: boolean;
  send: (text: string, opts?: { replyToId?: string | null }) => Promise<void>;
  /** Change a room's notification level — `null` when the port does not support it. */
  setRoomNotifyLevel: ((conversationId: string, level: RoomNotifyLevel) => Promise<void>) | null;
  /** Mute / unmute a conversation — `null` when the port does not support it. */
  setMuted: ((conversationId: string, muted: boolean) => Promise<void>) | null;
  /** A TIMED mute (`durationMs`) or forever (`null`) — `null` when the port does not support it. */
  muteFor: ((conversationId: string, durationMs: number | null) => Promise<void>) | null;
  /** Archive / unarchive a conversation — `null` when the port does not support it. */
  setArchived: ((conversationId: string, archived: boolean) => Promise<void>) | null;
  /** Block / unblock an address at the server — `null` when the port does not support it. The
   *  roster is unified across accounts, so the caller names which one. */
  blockContact: ((accountId: string, address: string, blocked: boolean) => Promise<void>) | null;
  /** Change a room's topic — `null` when the port does not support it. */
  setRoomTopic: ((conversationId: string, topic: string) => Promise<void>) | null;
  /** Invite a contact to a room — `null` when the port does not support it. */
  inviteToRoom: ((conversationId: string, invitee: string) => Promise<void>) | null;
  /** Add a contact to one account's roster — `null` when the port does not support it (or the
   *  protocol has no roster/subscription concept at all). The Contacts tab is unified across every
   *  account, so the caller (not an implicit "active account") names which one. */
  addContact: ((accountId: string, address: string) => Promise<void>) | null;
  /** Remove a contact from one account's roster — `null` for the same reason as {@link addContact}. */
  removeContact: ((accountId: string, address: string) => Promise<void>) | null;
  /** Leave a joined room — `null` when the port does not support it. */
  leaveRoom: ((conversationId: string) => Promise<void>) | null;
  /** Add / remove one of the local user's emoji reactions on a message — `null` when the port does
   *  not support it. `protocolId` addresses the message. */
  react:
    | ((conversationId: string, protocolId: string, emoji: string, on: boolean) => Promise<void>)
    | null;
  /** Replace an already-sent message's body — `null` when the port does not support it. */
  editMessage: ((protocolId: string, body: string) => Promise<void>) | null;
  /** The message the Composer is currently seeded to edit, if any. */
  editingMessage: { messageId: string; body: string } | null;
  /** Enter edit mode for one of the local user's own messages. */
  startEditing: (messageId: string, body: string) => void;
  /** Leave edit mode without submitting (Composer's ✕ / Escape). */
  cancelEditing: () => void;
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
 * their connection state, every account's conversations (the store already folds them together —
 * `listChatConversations()` with no id returns all of them, most-recently-updated first), the active
 * account's roster, and the open conversation's message window. Main computes every fold and pushes
 * it over `onChatState`; this hook just seeds from the reads and applies the changes.
 */
export function useChatState(port: ChatClientPort): UseChatState {
  const [accounts, setAccounts] = useState<readonly ChatAccountSummary[]>([]);
  const [connectionStates, setConnectionStates] = useState<Record<string, ChatConnState>>({});
  const [activeAccountId, setActiveAccountId] = useState<string | null>(null);
  const [client, setClient] = useState<ChatClientState>(emptyChatClientState);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingMessage, setEditingMessage] = useState<{ messageId: string; body: string } | null>(
    null,
  );

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

  // The Chats tab is a unified inbox across every account, not just the active one — (re)seed the
  // full conversation set whenever the account roster changes (an account added or removed), rather
  // than keying this off `activeAccountId` the way the roster fetch below does.
  const accountIdsKey = accounts.map((a) => a.id).join(',');
  useEffect(() => {
    if (accountIdsKey === '') return;
    let cancelled = false;
    void (async () => {
      const conversations = await port.listChatConversations();
      if (!cancelled) setClient((prev) => seedConversations(prev, conversations));
    })();
    return () => {
      cancelled = true;
    };
    // accountIdsKey (not `accounts`) is the intentional re-run trigger — `accounts` gets a new
    // array identity on every refresh() even when its contents are unchanged.
  }, [port, accountIdsKey]);

  // The Contacts tab is unified the same way the Chats tab is: every configured account's roster in
  // one list, not just the active one — `getChatRoster` (unlike `listChatConversations`) has no
  // "every account" form, so this fetches each account's roster in parallel and concatenates them;
  // contact ids are already namespaced per account (`${accountId}:${address}`), so no collision risk.
  useEffect(() => {
    if (accountIdsKey === '') return;
    let cancelled = false;
    const ids = accountIdsKey.split(',');
    void (async () => {
      const rosters = await Promise.all(ids.map((id) => port.getChatRoster(id)));
      if (!cancelled) setClient((prev) => seedRoster(prev, rosters.flat()));
    })();
    return () => {
      cancelled = true;
    };
  }, [port, accountIdsKey]);

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
    (conversationId: string | null, hintAccountId?: string): void => {
      setSelectedConversationId(conversationId);
      // An edit target from the previous conversation must not survive the switch — it would
      // otherwise submit against a `selectedConversationId` the Composer's banner no longer matches.
      setEditingMessage(null);
      if (conversationId === null) return;
      // The unified Chats tab can select a conversation belonging to any configured account, not
      // just the one the account switcher currently shows — resolve the owning account from the
      // conversation itself; `hintAccountId` (given by a caller starting a brand-new DM by address —
      // a room-member click, or opening a contact never messaged before — who already knows which
      // account it belongs to) wins over the `activeAccountId` fallback, which would otherwise
      // silently point a new conversation at the WRONG account when it differs from the one the
      // contact/room actually belongs to.
      const accountId =
        client.conversations[conversationId]?.accountId ?? hintAccountId ?? activeAccountId;
      if (accountId === null) return;
      if (accountId !== activeAccountId) setActiveAccountId(accountId);
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
        const page = await port.getChatHistory(accountId, conversationId);
        setClient((prev) => seedHistory(prev, conversationId, page.messages));
        const newest = page.messages.at(-1);
        if (newest !== undefined) {
          await port.markChatRead(accountId, conversationId, newest.protocolId);
        }
      })();
    },
    [port, activeAccountId, client.conversations, client.messages],
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
      // Always clears a lingering timed mute too, mirroring the runner: the two share one "is this
      // muted" bit, so a stale mutedUntil from a previous timed mute must not resurface later.
      setClient((prev) => patchConversation(prev, conversationId, { muted, mutedUntil: null }));
      await setChatMuted(activeAccountId, conversationId, muted);
    };
  }, [setChatMuted, activeAccountId]);

  const { muteChatFor } = port;
  const muteFor = useMemo(() => {
    if (muteChatFor === undefined) return null;
    return async (conversationId: string, durationMs: number | null): Promise<void> => {
      if (activeAccountId === null) return;
      setClient((prev) =>
        patchConversation(
          prev,
          conversationId,
          durationMs === null
            ? { muted: true, mutedUntil: null }
            : { muted: false, mutedUntil: Date.now() + durationMs },
        ),
      );
      await muteChatFor(activeAccountId, conversationId, durationMs);
    };
  }, [muteChatFor, activeAccountId]);

  const { setChatArchived } = port;
  const setArchived = useMemo(() => {
    if (setChatArchived === undefined) return null;
    return async (conversationId: string, archived: boolean): Promise<void> => {
      if (activeAccountId === null) return;
      setClient((prev) => patchConversation(prev, conversationId, { archived }));
      await setChatArchived(activeAccountId, conversationId, archived);
    };
  }, [setChatArchived, activeAccountId]);

  const { blockChatContact } = port;
  const blockContact = useMemo(() => {
    if (blockChatContact === undefined) return null;
    return async (accountId: string, address: string, blocked: boolean): Promise<void> => {
      // The roster is unified across accounts, so the caller (not `activeAccountId`) names which
      // one this contact belongs to — same reasoning as `addContact`/`removeContact`.
      setClient((prev) => patchContact(prev, `${accountId}:${address}`, { blocked }));
      await blockChatContact(accountId, address, blocked);
    };
  }, [blockChatContact]);

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

  const { editChatMessage } = port;
  const editMessage = useMemo(() => {
    if (editChatMessage === undefined) return null;
    return async (protocolId: string, body: string): Promise<void> => {
      if (activeAccountId === null || selectedConversationId === null) return;
      // No optimistic patch — like `react()`'s sibling in `account-runner.ts`, the server echo
      // (XEP-0308 / Matrix `m.replace`) is the source of truth for the edited body.
      await editChatMessage(activeAccountId, selectedConversationId, protocolId, body);
    };
  }, [editChatMessage, activeAccountId, selectedConversationId]);

  const startEditing = useCallback((messageId: string, body: string): void => {
    setEditingMessage({ messageId, body });
  }, []);

  const cancelEditing = useCallback((): void => {
    setEditingMessage(null);
  }, []);

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
    return async (accountId: string, address: string): Promise<void> => {
      // Write-only, same as inviteToRoom — the roster-change push (the server's roster-push, then
      // again once the subscription is approved) is what actually updates `client.roster`.
      await addChatContact(accountId, address);
    };
  }, [addChatContact]);

  const { removeChatContact } = port;
  const removeContact = useMemo(() => {
    if (removeChatContact === undefined) return null;
    return async (accountId: string, address: string): Promise<void> => {
      // Write-only, same as addContact — the server's roster-push (subscription now "remove") is
      // what actually updates `client.roster`.
      await removeChatContact(accountId, address);
    };
  }, [removeChatContact]);

  const { leaveChatRoom } = port;
  const leaveRoom = useMemo(() => {
    if (leaveChatRoom === undefined) return null;
    return async (conversationId: string): Promise<void> => {
      if (activeAccountId === null) return;
      await leaveChatRoom(activeAccountId, conversationId);
      // The panel has no business staying open on a room the user just walked out of.
      setSelectedConversationId((current) => (current === conversationId ? null : current));
      // The unified list spans every account — a full re-seed needs the full set, not just this
      // account's (seedConversations replaces the whole map, so a scoped fetch here would silently
      // drop every other account's rows).
      const conversations = await port.listChatConversations();
      setClient((prev) => seedConversations(prev, conversations));
    };
  }, [leaveChatRoom, activeAccountId, port]);

  /** Every account's conversations, most-recently-active first (the unified Chats tab). */
  const conversations = useMemo(
    () => sortConversations(Object.values(client.conversations)),
    [client.conversations],
  );

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
        // way the panel learns about it before selecting it. Fetch the full set (see `leaveRoom`
        // above) since seedConversations replaces the whole map.
        const conversations = await port.listChatConversations();
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
    muteFor,
    setArchived,
    blockContact,
    setRoomTopic,
    inviteToRoom,
    addContact,
    removeContact,
    leaveRoom,
    react,
    editMessage,
    editingMessage,
    startEditing,
    cancelEditing,
    refresh,
    rooms,
  };
}
