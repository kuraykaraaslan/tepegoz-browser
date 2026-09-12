import { useMemo, useState } from 'react';
import { useT } from '@tepegoz/i18n/react';
import './chat-ui.css';
import type { RoomNotifyLevel, RoomView } from '@tepegoz/chat-core';
import type { ChatContact, ChatConversation, ChatMessage } from '@tepegoz/shared-types';
import { chatUiDict } from './i18n';
import { AccountsManager } from './AccountsManager';
import { Avatar } from './Avatar';
import { Composer } from './Composer';
import { ConversationList } from './ConversationList';
import { MessageTimeline } from './MessageTimeline';
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
  /** Resolve an attachment's `mediaRef` to a LOCAL resource; absent ⇒ attachments are not shown. */
  resolveMedia?: ResolveMedia | undefined;
  onOpenMedia?: ((mediaRef: string) => void) | undefined;
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
  resolveMedia,
  onOpenMedia,
}: Readonly<ChatWorkspaceProps>) {
  const s = useT(chatUiDict);
  const chat = useChatState(port);
  const [tab, setTab] = useState<LeftTab>('chats');
  const [membersOpen, setMembersOpen] = useState(false);
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

  const rosterList = useMemo(
    () => Object.values(chat.client.roster).filter((c) => c.accountId === chat.activeAccountId),
    [chat.client.roster, chat.activeAccountId],
  );
  const contactByAddress = useMemo(() => {
    const map = new Map<string, ChatContact>();
    for (const c of rosterList) map.set(c.address, c);
    return map;
  }, [rosterList]);

  const selected: ChatConversation | undefined =
    chat.selectedConversationId === null
      ? undefined
      : chat.client.conversations[chat.selectedConversationId];
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
          {...(chat.removeAccount !== null
            ? { onRemove: (accountId: string) => void chat.removeAccount?.(accountId) }
            : {})}
        />
      </div>
    );
  }

  return (
    <div className="chat-workspace">
      {chat.accounts.length > 1 && (
        <div className="chat-workspace__accounts" role="tablist" aria-label={s.workspace.accountSwitcher}>
          {chat.accounts.map((account) => (
            <button
              key={account.id}
              type="button"
              role="tab"
              aria-selected={account.id === chat.activeAccountId}
              data-conn={chat.connectionStates[account.id] ?? 'idle'}
              onClick={() => chat.setActiveAccount(account.id)}
            >
              {account.label}
            </button>
          ))}
        </div>
      )}

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
            <ConversationList
              conversations={chat.conversations}
              accounts={accountRefs}
              selectedId={chat.selectedConversationId}
              onSelect={chat.selectConversation}
              presenceOf={(c) =>
                c.kind === 'dm' ? contactByAddress.get(c.address)?.presence ?? null : null
              }
            />
          )}
          {tab === 'contacts' && (
            <RosterPanel
              contacts={rosterList}
              onOpenContact={(contact) => {
                const existing = chat.conversations.find((c) => c.address === contact.address);
                if (existing !== undefined) {
                  setTab('chats');
                  chat.selectConversation(existing.id);
                }
              }}
            />
          )}
          {tab === 'rooms' && chat.rooms !== null && (
            <RoomBrowser
              discoverRooms={chat.rooms.discover}
              onJoin={(jid) => {
                void chat.rooms?.join(jid);
                setTab('chats');
              }}
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
                  muted={selected.muted}
                  {...(chat.setRoomNotifyLevel !== null
                    ? {
                        onSetNotifyLevel: (level: RoomNotifyLevel) => {
                          void chat.setRoomNotifyLevel?.(selected.id, level);
                        },
                      }
                    : {})}
                  {...(chat.setMuted !== null
                    ? { onToggleMuted: () => void chat.setMuted?.(selected.id, !selected.muted) }
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
                  {chat.setMuted !== null && (
                    <button
                      type="button"
                      className="chat-workspace__mute"
                      aria-pressed={selected.muted}
                      onClick={() => void chat.setMuted?.(selected.id, !selected.muted)}
                    >
                      {selected.muted ? s.workspace.unmute : s.workspace.mute}
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
                  {...(chat.react !== null
                    ? {
                        onReact: (protocolId: string, emoji: string, on: boolean) => {
                          void chat.react?.(selected.id, protocolId, emoji, on);
                        },
                      }
                    : {})}
                />
                {selected.kind === 'room' && membersOpen && selectedRoom !== undefined && (
                  <RoomMemberList room={selectedRoom} />
                )}
              </div>
              <Composer
                onSubmit={(draft) => chat.send(draft.text, { replyToId: draft.replyToId })}
              />
            </>
          )}
        </section>
      </div>
    </div>
  );
}
