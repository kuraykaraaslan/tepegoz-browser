import { useMemo, useState } from 'react';
import { useT } from '@tepegoz/i18n/react';
import './chat-ui.css';
import type { RoomNotifyLevel, RoomView } from '@tepegoz/chat-core';
import type { ChatContact, ChatConversation, ChatMessage } from '@tepegoz/shared-types';
import { chatUiDict } from './i18n';
import { AccountsManager } from './AccountsManager';
import { stubConversation } from './chat-store';
import { Avatar } from './Avatar';
import { Composer } from './Composer';
import { ConversationList } from './ConversationList';
import { MessageTimeline } from './MessageTimeline';
import { isMutedNow } from './mute';
import { MuteMenu } from './MuteMenu';
import { NotEncryptedBadge } from './NotEncryptedBadge';
import { RoomBrowser } from './RoomBrowser';
import { RoomHeader } from './RoomHeader';
import { RoomMemberList } from './RoomMemberList';
import { RosterPanel } from './RosterPanel';
import { conversationTitle, type ChatAccountRef } from './conversation-list';
import { roomTypingLabel } from './typing';
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

type LeftTab = 'chats' | 'contacts' | 'rooms';

/**
 * Is this message the local user's own? A DM has exactly two parties, so anything not from the
 * peer is ours. A room has no such shortcut — protocols disagree on what `senderAddress` holds for
 * a room message (XMPP: the full occupant JID `room@service/nick`; IRC: the bare nick; Matrix: the
 * bare user id) — so this compares against the room's `selfNick`, which every adapter's occupant
 * fold already derives in that SAME shape (see `chat-core`'s `RoomView`).
 */
function messageIsOwn(
  message: ChatMessage,
  selected: ChatConversation,
  selectedRoom: RoomView | undefined,
): boolean {
  if (selected.kind === 'dm') return message.senderAddress !== selected.address;
  if (selectedRoom?.selfNick == null) return false;
  const slash = message.senderAddress.indexOf('/');
  const nick = slash === -1 ? message.senderAddress : message.senderAddress.slice(slash + 1);
  return nick === selectedRoom.selfNick;
}

/** Inline gear — chat-ui is a string-free leaf with no icon dependency, so the glyph lives here. */
function GearIcon() {
  return (
    <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M11.3 1.6a1 1 0 0 0-2.6 0l-.2 1.2a6.6 6.6 0 0 0-1.5.9L5.9 5a1 1 0 0 0-1.3.4L3.3 7.6a1 1 0 0 0 .3 1.3l1 .8a6.7 6.7 0 0 0 0 1.8l-1 .8a1 1 0 0 0-.3 1.3l1.3 2.2A1 1 0 0 0 5.9 18l1.1-.5c.5.4 1 .7 1.5.9l.2 1.2a1 1 0 0 0 2.6 0l.2-1.2c.6-.2 1-.5 1.5-.9l1.1.5a1 1 0 0 0 1.3-.4l1.3-2.2a1 1 0 0 0-.3-1.3l-1-.8a6.7 6.7 0 0 0 0-1.8l1-.8a1 1 0 0 0 .3-1.3l-1.3-2.2A1 1 0 0 0 14.1 5l-1.1.5c-.5-.4-1-.7-1.5-.9l-.2-1.2ZM10 13a3 3 0 1 1 0-6 3 3 0 0 1 0 6Z"
      />
    </svg>
  );
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
  const [tab, setTab] = useState<LeftTab>('chats');
  const [membersOpen, setMembersOpen] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [managingAccounts, setManagingAccounts] = useState(false);

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
    ? chat.client.messages[selected.id] ?? []
    : [];
  const typing = selected ? chat.client.typing[selected.id] ?? [] : [];
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

  // The room browser's "Find a room" tab always operates on the active account (not the open
  // conversation) — only XMPP has a directory to browse (XEP-0030); IRC has no room-listing command
  // and Matrix's room directory is deferred (see ext-chat.md X-chat.5), so both fall back to
  // join-by-address only, worded for their own address shape rather than an XMPP JID.
  const activeProtocol = chat.accounts.find((a) => a.id === chat.activeAccountId)?.protocol;
  const canBrowseRooms = activeProtocol === 'xmpp';
  const roomAddressPlaceholder =
    activeProtocol === 'irc'
      ? s.roomBrowser.joinByAddressPlaceholderIrc
      : activeProtocol === 'matrix'
        ? s.roomBrowser.joinByAddressPlaceholderMatrix
        : undefined;

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
        <aside className="chat-workspace__left">
          <div className="chat-workspace__left-head">
            <span className="chat-workspace__left-title">{s.workspace.title}</span>
            <button
              type="button"
              className="chat-workspace__icon-btn"
              aria-label={s.workspace.manageAccounts}
              title={s.workspace.manageAccounts}
              onClick={() => setManagingAccounts(true)}
            >
              <GearIcon />
            </button>
          </div>
          {noAccounts && (
            <p className="chat-workspace__no-accounts">
              <span>{s.workspace.noAccounts}</span>
              {onAddAccount !== undefined && (
                <button type="button" onClick={onAddAccount}>
                  {s.workspace.addAccount}
                </button>
              )}
            </p>
          )}
          <div className="chat-workspace__tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'chats'}
              onClick={() => setTab('chats')}
            >
              {s.workspace.chatsTab}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'contacts'}
              onClick={() => setTab('contacts')}
            >
              {s.workspace.contactsTab}
            </button>
            {chat.rooms !== null && (
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'rooms'}
                onClick={() => setTab('rooms')}
              >
                {s.roomBrowser.title}
              </button>
            )}
          </div>

          {tab === 'chats' && (
            <>
              {(showArchived || archivedCount > 0) && (
                <button
                  type="button"
                  className="chat-workspace__archived-toggle"
                  onClick={() => setShowArchived((v) => !v)}
                >
                  {showArchived
                    ? s.workspace.backToChats
                    : `${s.workspace.showArchived} (${String(archivedCount)})`}
                </button>
              )}
              <ConversationList
                conversations={visibleConversations}
                accounts={accountRefs}
                selectedId={chat.selectedConversationId}
                onSelect={chat.selectConversation}
                presenceOf={(c) =>
                  c.kind === 'dm' ? contactByAddress.get(c.address)?.presence ?? null : null
                }
              />
            </>
          )}
          {tab === 'contacts' && (
            <RosterPanel
              contacts={rosterList}
              accounts={accountRefs}
              onOpenContact={(contact) => {
                const existing = chat.conversations.find(
                  (c) => c.accountId === contact.accountId && c.address === contact.address,
                );
                // A DM's conversation id is its peer's bare address (see `blankConversation`) — a
                // contact never messaged before has no row yet, so this starts one rather than
                // silently doing nothing (the previous behavior for that case).
                setTab('chats');
                chat.selectConversation(existing?.id ?? contact.address, contact.accountId);
              }}
              {...(chat.addContact !== null
                ? {
                    onAddContact: (accountId: string, address: string) =>
                      chat.addContact?.(accountId, address),
                  }
                : {})}
              {...(chat.removeContact !== null
                ? { onRemoveContact: (contact) => chat.removeContact?.(contact.accountId, contact.address) }
                : {})}
            />
          )}
          {tab === 'rooms' && chat.rooms !== null && (
            <RoomBrowser
              discoverRooms={chat.rooms.discover}
              onJoin={(jid) =>
                // Only leave the room-browser tab once the join actually succeeds — switching
                // unconditionally (the previous behaviour) meant a failed join (account not yet
                // connected, bad address, refused by the server) silently landed on an empty chats
                // pane with no room and no visible error.
                chat.rooms?.join(jid).then(() => setTab('chats'))
              }
              canBrowse={canBrowseRooms}
              {...(roomAddressPlaceholder !== undefined
                ? { addressPlaceholder: roomAddressPlaceholder }
                : {})}
            />
          )}
        </aside>

        <section className="chat-workspace__main">
          {selected === undefined ? (
            <p className="chat-workspace__no-selection">{s.workspace.noSelection}</p>
          ) : (
            <>
              <button
                type="button"
                className="chat-workspace__back"
                onClick={() => chat.selectConversation(null)}
              >
                <span aria-hidden="true">‹</span> {s.workspace.title}
              </button>
              {selected.kind === 'room' ? (
                <RoomHeader
                  name={conversationTitle(selected)}
                  {...(selectedRoom !== undefined ? { room: selectedRoom } : {})}
                  topicFallback={selected.topic}
                  membersOpen={membersOpen}
                  onToggleMembers={() => setMembersOpen((v) => !v)}
                  notifyLevel={selected.notifyLevel}
                  notEncrypted={notEncrypted}
                  mutedNow={isMutedNow(selected, Date.now())}
                  {...(chat.setRoomNotifyLevel !== null
                    ? {
                        onSetNotifyLevel: (level: RoomNotifyLevel) => {
                          void chat.setRoomNotifyLevel?.(selected.id, level);
                        },
                      }
                    : {})}
                  {...(chat.muteFor !== null && chat.setMuted !== null
                    ? {
                        onMuteFor: (durationMs: number | null) =>
                          void chat.muteFor?.(selected.id, durationMs),
                        onUnmute: () => void chat.setMuted?.(selected.id, false),
                      }
                    : {})}
                  archived={selected.archived}
                  {...(chat.setArchived !== null
                    ? {
                        onToggleArchived: () =>
                          void chat.setArchived?.(selected.id, !selected.archived),
                      }
                    : {})}
                  {...(chat.setRoomTopic !== null
                    ? { onSetTopic: (topic: string) => void chat.setRoomTopic?.(selected.id, topic) }
                    : {})}
                  {...(chat.inviteToRoom !== null
                    ? { onInvite: (who: string) => void chat.inviteToRoom?.(selected.id, who) }
                    : {})}
                  {...(chat.leaveRoom !== null
                    ? { onLeave: () => void chat.leaveRoom?.(selected.id) }
                    : {})}
                />
              ) : (
                <header className="chat-workspace__conv-head">
                  <span className="chat-workspace__conv-head-avatar">
                    <Avatar name={conversationTitle(selected)} seed={selected.id} />
                  </span>
                  <h2>{conversationTitle(selected)}</h2>
                  {notEncrypted && <NotEncryptedBadge />}
                  {typing.length > 0 && (
                    <span className="chat-workspace__typing">{s.workspace.typing}</span>
                  )}
                  {chat.muteFor !== null && chat.setMuted !== null && (
                    <MuteMenu
                      mutedNow={isMutedNow(selected, Date.now())}
                      onMuteFor={(durationMs) => void chat.muteFor?.(selected.id, durationMs)}
                      onUnmute={() => void chat.setMuted?.(selected.id, false)}
                    />
                  )}
                  {chat.setArchived !== null && (
                    <button
                      type="button"
                      className="chat-workspace__archive"
                      aria-pressed={selected.archived}
                      onClick={() => void chat.setArchived?.(selected.id, !selected.archived)}
                    >
                      {selected.archived ? s.workspace.unarchive : s.workspace.archive}
                    </button>
                  )}
                </header>
              )}
              {selected.kind === 'room' && roomTypingLabel(typing, s.workspace) !== null && (
                <p className="chat-workspace__typing chat-workspace__room-typing">
                  {roomTypingLabel(typing, s.workspace)}
                </p>
              )}
              <div className="chat-workspace__conv-body">
                <MessageTimeline
                  key={selected.id}
                  messages={messages}
                  lastReadId={selected.lastReadId}
                  isOwn={(m) => messageIsOwn(m, selected, selectedRoom)}
                  resolveMedia={effectiveResolveMedia}
                  onOpenMedia={onOpenMedia}
                  {...(onOpenLink !== undefined ? { onOpenLink } : {})}
                  {...(chat.react !== null && reactionsSupported
                    ? {
                        onReact: (protocolId: string, emoji: string, on: boolean) => {
                          void chat.react?.(selected.id, protocolId, emoji, on);
                        },
                      }
                    : {})}
                  {...(chat.editMessage !== null
                    ? {
                        onEdit: (protocolId: string, body: string) => {
                          chat.startEditing(protocolId, body);
                        },
                      }
                    : {})}
                />
                {selected.kind === 'room' && membersOpen && selectedRoom !== undefined && (
                  <RoomMemberList
                    room={selectedRoom}
                    onSelectMember={(nick) => {
                      // A real JID (XMPP non-anonymous MUC) is the addressable identity; otherwise
                      // the nick itself already IS one (Matrix's occupant "nick" is the bare mxid,
                      // and an IRC nick is what a PM/query actually targets).
                      if (nick === selectedRoom.selfNick) return; // no DM with yourself
                      const address = selectedRoom.occupants[nick]?.realJid ?? nick;
                      const existing = chat.conversations.find(
                        (c) => c.kind === 'dm' && c.accountId === selected.accountId && c.address === address,
                      );
                      // A DM's conversation id is its peer's bare address (see `blankConversation`) —
                      // `selectConversation` handles a brand-new one gracefully.
                      chat.selectConversation(existing?.id ?? address, selected.accountId);
                      setTab('chats');
                    }}
                  />
                )}
              </div>
              <Composer
                onSubmit={(draft) =>
                  draft.editMessageId !== null
                    ? chat.editMessage?.(draft.editMessageId, draft.text)
                    : chat.send(draft.text, { replyToId: draft.replyToId })
                }
                editing={chat.editingMessage}
                onCancelContext={chat.cancelEditing}
              />
            </>
          )}
        </section>
      </div>
    </div>
  );
}
