import { useMemo, useState } from 'react';
import { useT } from '@tepegoz/i18n/react';
import './chat-ui.css';
import type { ChatContact, ChatConversation, ChatMessage } from '@tepegoz/shared-types';
import { chatUiDict } from './i18n';
import { AccountsManager } from './AccountsManager';
import { stubConversation } from './chat-store';
import { ChatConversationPane } from './ChatConversationPane';
import { ChatWorkspaceSidebar, type ChatWorkspaceLeftTab } from './ChatWorkspaceSidebar';
import { NewChatDialog } from './NewChatDialog';
import type { ChatAccountRef } from './conversation-list';
import type { ResolveMedia } from './MessageMedia';
import { dataUrlMime } from './media';
import { useChatState } from './useChatState';
import type { ChatClientPort } from './types';

export interface ChatWorkspaceProps {
  port: ChatClientPort;
  /** Open the add-account flow (owned by the host — it collects the secret). */
  onAddAccount?: () => void;
  /** Open the edit flow for one account (owned by the host, same as {@link onAddAccount} — it reads
   *  the account's current config and collects a new secret if the user wants one). */
  onEditAccount?: (accountId: string) => void;
  /** Resolve an attachment's `mediaRef` to a LOCAL resource; absent ⇒ attachments are not shown. */
  resolveMedia?: ResolveMedia | undefined;
  onOpenMedia?: ((mediaRef: string) => void) | undefined;
  /** Open a link the user clicked (typically a new tab, host's choice) — absent ⇒ links render as
   *  inert text, same as `<MessageTimeline>`'s own default. */
  onOpenLink?: ((href: string) => void) | undefined;
}

/**
 * The whole messenger surface composed over {@link useChatState}: an account switcher, a
 * chats / contacts left column, and the open conversation (timeline + composer). Presentational glue
 * only — every side effect goes through the injected {@link ChatClientPort}.
 */
export function ChatWorkspace({
  port,
  onAddAccount,
  onEditAccount,
  resolveMedia,
  onOpenMedia,
  onOpenLink,
}: Readonly<ChatWorkspaceProps>) {
  const s = useT(chatUiDict);
  const chat = useChatState(port);
  const [tab, setTab] = useState<ChatWorkspaceLeftTab>('chats');
  const [membersOpen, setMembersOpen] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [managingAccounts, setManagingAccounts] = useState(false);
  const [newChatOpen, setNewChatOpen] = useState(false);

  // Prefer an explicit `resolveMedia` prop; otherwise adapt the port's `resolveChatMedia` for the
  // active account. The host still returns a LOCAL `data:` URL — `<MessageMedia>` re-checks.
  const { resolveChatMedia } = port;
  const activeAccountId = chat.activeAccountId;
  const effectiveResolveMedia = useMemo<ResolveMedia | undefined>(() => {
    if (resolveMedia !== undefined) return resolveMedia;
    if (resolveChatMedia === undefined || activeAccountId === null) return undefined;
    return async (mediaRef: string) => {
      const out = await resolveChatMedia(activeAccountId, mediaRef);
      if (out === null) return null;
      return { url: out.dataUrl, mime: dataUrlMime(out.dataUrl), name: 'attachment' };
    };
  }, [resolveMedia, resolveChatMedia, activeAccountId]);

  const accountRefs: ChatAccountRef[] = chat.accounts.map((a) => ({
    id: a.id,
    label: a.label,
    color: a.color,
    protocol: a.protocol,
  }));

  // The Contacts tab is unified across every account, same as the Chats tab — no per-account
  // filtering; which account a contact belongs to shows via <RosterPanel>'s protocol badge.
  const rosterList = useMemo(() => Object.values(chat.client.roster), [chat.client.roster]);
  const joinedRooms = useMemo(
    () => chat.conversations.filter((c) => c.kind === 'room' && !c.archived),
    [chat.conversations],
  );

  // Shared by <RosterPanel>'s row click and <NewChatDialog>'s Contacts tab: a DM's conversation id is
  // its peer's bare address (see `blankConversation`) — a contact never messaged before has no row
  // yet, so this starts one rather than silently doing nothing.
  const openContact = (contact: ChatContact): void => {
    const existing = chat.conversations.find(
      (c) => c.accountId === contact.accountId && c.address === contact.address,
    );
    setTab('chats');
    chat.selectConversation(existing?.id ?? contact.address, contact.accountId);
  };
  const openRoom = (conversation: ChatConversation): void => {
    setTab('chats');
    chat.selectConversation(conversation.id, conversation.accountId);
  };
  // The generic "start by address" field — same existing-row lookup as `openContact`, just without a
  // roster entry to key off of. Deliberately not a room join (that stays in the Rooms tab): this is
  // for starting a DM with an address the user already knows, phone-lookup's future landing spot.
  const startByAddress = (accountId: string, address: string): void => {
    const existing = chat.conversations.find(
      (c) => c.accountId === accountId && c.address === address,
    );
    setTab('chats');
    chat.selectConversation(existing?.id ?? address, accountId);
  };

  // Archived conversations stay fully functional (still receive messages, still selectable once
  // reached) — they are just off the default list, same idea as an OS's archived-mail folder. Toggle
  // between the two views rather than showing both at once, so an archive is actually "out of the way".
  const archivedCount = useMemo(
    () => chat.conversations.filter((c) => c.archived).length,
    [chat.conversations],
  );
  const visibleConversations = useMemo(
    () => chat.conversations.filter((c) => c.archived === showArchived),
    [chat.conversations, showArchived],
  );
  const contactByAddress = useMemo(() => {
    const map = new Map<string, ChatContact>();
    for (const c of rosterList) map.set(c.address, c);
    return map;
  }, [rosterList]);

  // A DM the user has never messaged before has no row yet — stub one rather than showing a dead
  // "pick a conversation" pane for a selection that DID succeed (the room-member and roster
  // "start a chat" actions rely on this: they select a not-yet-existing DM by its address).
  const selected: ChatConversation | undefined =
    chat.selectedConversationId === null
      ? undefined
      : (chat.client.conversations[chat.selectedConversationId] ??
        (chat.activeAccountId !== null
          ? stubConversation(chat.selectedConversationId, chat.activeAccountId)
          : undefined));
  const messages: readonly ChatMessage[] = selected
    ? (chat.client.messages[selected.id] ?? [])
    : [];
  const typing = selected ? (chat.client.typing[selected.id] ?? []) : [];
  const selectedRoom = selected ? chat.client.rooms[selected.id] : undefined;
  // IRC has no end-to-end encryption at any layer — surface that on every one of its conversations.
  // Derived from the account protocol rather than an adapter-caps round-trip: the fact is static and
  // total, and the presentational leaf takes no IPC-contract dependency to learn it.
  const selectedProtocol = selected
    ? chat.accounts.find((a) => a.id === selected.accountId)?.protocol
    : undefined;
  const notEncrypted = selectedProtocol === 'irc';
  // IRC has no reaction mechanism at all (no XEP-0444 / `m.reaction` equivalent) and a bridge's
  // capability is still unimplemented (X-chat.8/.9) — same "derive from the static protocol fact"
  // reasoning as `notEncrypted` above, not a live caps round-trip.
  const reactionsSupported = selectedProtocol === 'xmpp' || selectedProtocol === 'matrix';

  // Only XMPP has a directory to browse (XEP-0030) — IRC has no room-listing command and Matrix's
  // room directory is deferred (see ext-chat.md X-chat.5). `<NewChatDialog>`'s Rooms tab still lets
  // either join by address, just not browse a directory first.
  const browsableAccountIds = useMemo(
    () => new Set(chat.accounts.filter((a) => a.protocol === 'xmpp').map((a) => a.id)),
    [chat.accounts],
  );

  const noAccounts = !chat.loading && chat.accounts.length === 0;

  // While the first accounts/conversations fetch is in flight, `noAccounts` stays false (it doesn't
  // know yet whether there's anything to show) and the grid below renders with both panes empty — a
  // sparse two-column layout for a fraction of a second, easy to misread as broken. Showing an
  // explicit, obviously-intentional loading state here instead of the empty grid is uglier to skip.
  if (chat.loading) {
    return (
      <div className="chat-workspace">
        <p className="chat-workspace__loading" role="status">
          {s.workspace.loading}
        </p>
      </div>
    );
  }

  if (managingAccounts) {
    return (
      <div className="chat-workspace">
        <AccountsManager
          accounts={chat.accounts}
          connectionStates={chat.connectionStates}
          onClose={() => setManagingAccounts(false)}
          {...(onAddAccount !== undefined
            ? {
                onAdd: () => {
                  setManagingAccounts(false);
                  onAddAccount();
                },
              }
            : {})}
          {...(onEditAccount !== undefined
            ? {
                onEdit: (accountId: string) => {
                  setManagingAccounts(false);
                  onEditAccount(accountId);
                },
              }
            : {})}
          {...(chat.removeAccount !== null
            ? { onRemove: (accountId: string) => void chat.removeAccount?.(accountId) }
            : {})}
        />
      </div>
    );
  }

  return (
    <div className="chat-workspace">
      {/* No account-switcher tabs — the Chats/Contacts lists are already unified across every
       *  account (grouping/switching would just duplicate what the avatar's protocol badge already
       *  shows); `activeAccountId` still exists internally, driven by whichever conversation is
       *  selected. */}

      <div className="chat-workspace__body">
        <ChatWorkspaceSidebar
          chat={chat}
          tab={tab}
          onTabChange={setTab}
          noAccounts={noAccounts}
          onAddAccount={onAddAccount}
          onNewChat={() => setNewChatOpen(true)}
          onManageAccounts={() => setManagingAccounts(true)}
          showArchived={showArchived}
          onToggleArchived={() => setShowArchived((v) => !v)}
          archivedCount={archivedCount}
          visibleConversations={visibleConversations}
          accountRefs={accountRefs}
          rosterList={rosterList}
          contactByAddress={contactByAddress}
          onOpenContact={openContact}
        />

        {newChatOpen && (
          <NewChatDialog
            contacts={rosterList}
            accounts={accountRefs}
            joinedRooms={joinedRooms}
            onOpenContact={openContact}
            onOpenRoom={openRoom}
            onStartByAddress={startByAddress}
            onClose={() => setNewChatOpen(false)}
            browsableAccountIds={browsableAccountIds}
            {...(chat.rooms !== null
              ? {
                  discoverRooms: chat.rooms.discover,
                  onJoinRoom: chat.rooms.join,
                }
              : {})}
          />
        )}

        <ChatConversationPane
          chat={chat}
          selected={selected}
          selectedRoom={selectedRoom}
          messages={messages}
          typing={typing}
          notEncrypted={notEncrypted}
          reactionsSupported={reactionsSupported}
          membersOpen={membersOpen}
          onToggleMembers={() => setMembersOpen((v) => !v)}
          resolveMedia={effectiveResolveMedia}
          onOpenMedia={onOpenMedia}
          onOpenLink={onOpenLink}
          onShowChats={() => setTab('chats')}
        />
      </div>
    </div>
  );
}
