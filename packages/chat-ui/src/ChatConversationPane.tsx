import { useT } from '@tepegoz/i18n/react';
import type { RoomNotifyLevel, RoomView } from '@tepegoz/chat-core';
import type { ChatConversation, ChatMessage } from '@tepegoz/shared-types';
import { chatUiDict } from './i18n';
import { Avatar } from './Avatar';
import { Composer } from './Composer';
import { MessageTimeline } from './MessageTimeline';
import type { ResolveMedia } from './MessageMedia';
import { isMutedNow } from './mute';
import { MuteMenu } from './MuteMenu';
import { NotEncryptedBadge } from './NotEncryptedBadge';
import { RoomHeader } from './RoomHeader';
import { RoomMemberList } from './RoomMemberList';
import { conversationTitle } from './conversation-list';
import { messageIsOwn } from './chat-workspace-own';
import { roomTypingLabel } from './typing';
import type { UseChatState } from './useChatState';

export interface ChatConversationPaneProps {
  chat: UseChatState;
  /** The open conversation — already stubbed by the caller when it has no row yet. */
  selected: ChatConversation | undefined;
  selectedRoom: RoomView | undefined;
  messages: readonly ChatMessage[];
  typing: readonly string[];
  notEncrypted: boolean;
  reactionsSupported: boolean;
  membersOpen: boolean;
  onToggleMembers: () => void;
  resolveMedia: ResolveMedia | undefined;
  onOpenMedia?: ((mediaRef: string) => void) | undefined;
  onOpenLink?: ((href: string) => void) | undefined;
  /** A room member was picked for a DM: the caller flips the left column back to Chats. */
  onShowChats: () => void;
}

/** The right column: the open conversation's header, timeline (+ room roster) and composer. */
export function ChatConversationPane({
  chat,
  selected,
  selectedRoom,
  messages,
  typing,
  notEncrypted,
  reactionsSupported,
  membersOpen,
  onToggleMembers,
  resolveMedia: effectiveResolveMedia,
  onOpenMedia,
  onOpenLink,
  onShowChats,
}: Readonly<ChatConversationPaneProps>) {
  const s = useT(chatUiDict);
  return (
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
              onToggleMembers={() => onToggleMembers()}
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
                ? {
                    onSetTopic: (topic: string) => void chat.setRoomTopic?.(selected.id, topic),
                  }
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
              {/* The identity group shrinks and truncates as one unit — a long JID-length name
               *  must never squeeze the mute/archive controls out of reach on the right. */}
              <span className="chat-workspace__conv-head-id">
                <h2 title={conversationTitle(selected)}>{conversationTitle(selected)}</h2>
                {notEncrypted && <NotEncryptedBadge />}
                {typing.length > 0 && (
                  <span className="chat-workspace__typing">{s.workspace.typing}</span>
                )}
              </span>
              <span className="chat-workspace__conv-head-actions">
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
              </span>
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
                    (c) =>
                      c.kind === 'dm' &&
                      c.accountId === selected.accountId &&
                      c.address === address,
                  );
                  // A DM's conversation id is its peer's bare address (see `blankConversation`) —
                  // `selectConversation` handles a brand-new one gracefully.
                  chat.selectConversation(existing?.id ?? address, selected.accountId);
                  onShowChats();
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
  );
}
