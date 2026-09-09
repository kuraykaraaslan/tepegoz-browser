import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ChatConnState } from '@tepegoz/chat-core';
import type { ChatConversation } from '@tepegoz/shared-types';
import {
  applyChatChange,
  emptyChatClientState,
  seedConversations,
  seedHistory,
  seedRoster,
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
  client: ChatClientState;
  /** Conversations of the active account, most-recent first. */
  conversations: readonly ChatConversation[];
  selectedConversationId: string | null;
  selectConversation: (conversationId: string | null) => void;
  /** True until the first accounts + conversations load resolves. */
  loading: boolean;
  send: (text: string, opts?: { replyToId?: string | null }) => Promise<void>;
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
      await port.sendChatMessage(activeAccountId, selectedConversationId, {
        body: text,
        replyToId: opts?.replyToId ?? null,
        mediaPath: null,
      });
    },
    [port, activeAccountId, selectedConversationId],
  );

  const setActiveAccount = useCallback((accountId: string): void => {
    setActiveAccountId(accountId);
    setSelectedConversationId(null);
  }, []);

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
        await joinChatRoom(activeAccountId, roomJid);
        await refresh();
        setSelectedConversationId(roomJid);
      },
    };
  }, [discoverChatRooms, joinChatRoom, activeAccountId, refresh]);

  return {
    accounts,
    connectionStates,
    activeAccountId,
    setActiveAccount,
    client,
    conversations,
    selectedConversationId,
    selectConversation,
    loading,
    send,
    refresh,
    rooms,
  };
}
