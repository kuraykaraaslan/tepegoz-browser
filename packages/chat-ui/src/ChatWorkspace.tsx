import { useMemo, useState } from 'react';
import { useT } from '@tepegoz/i18n/react';
import './chat-ui.css';
import type { RoomNotifyLevel } from '@tepegoz/chat-core';
import type { ChatContact, ChatConversation, ChatMessage } from '@tepegoz/shared-types';
import { chatUiDict } from './i18n';
import { Composer } from './Composer';
import { ConversationList } from './ConversationList';
import { MessageTimeline } from './MessageTimeline';
import { NotEncryptedBadge } from './NotEncryptedBadge';
import { RoomBrowser } from './RoomBrowser';
import { RoomHeader } from './RoomHeader';
import { RoomMemberList } from './RoomMemberList';
import { RosterPanel } from './RosterPanel';
import { conversationTitle, type ChatAccountRef } from './conversation-list';
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
          {noAccounts && (
            <div className="chat-workspace__no-accounts">
              <p>{s.workspace.noAccounts}</p>
              {onAddAccount !== undefined && (
                <button type="button" onClick={onAddAccount}>
                  {s.workspace.addAccount}
                </button>
              )}
            </div>
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
              {selected.kind === 'room' ? (
                <RoomHeader
                  name={conversationTitle(selected)}
                  {...(selectedRoom !== undefined ? { room: selectedRoom } : {})}
                  topicFallback={selected.topic}
                  membersOpen={membersOpen}
                  onToggleMembers={() => setMembersOpen((v) => !v)}
                  notifyLevel={selected.notifyLevel}
                  notEncrypted={notEncrypted}
                  {...(chat.setRoomNotifyLevel !== null
                    ? {
                        onSetNotifyLevel: (level: RoomNotifyLevel) => {
                          void chat.setRoomNotifyLevel?.(selected.id, level);
                        },
                      }
                    : {})}
                />
              ) : (
                <header className="chat-workspace__conv-head">
                  <h2>{conversationTitle(selected)}</h2>
                  {notEncrypted && <NotEncryptedBadge />}
                  {typing.length > 0 && (
                    <span className="chat-workspace__typing">{s.workspace.typing}</span>
                  )}
                </header>
              )}
              <div className="chat-workspace__conv-body">
                <MessageTimeline
                  messages={messages}
                  lastReadId={selected.lastReadId}
                  isOwn={(m) => selected.kind === 'dm' && m.senderAddress !== selected.address}
                  resolveMedia={effectiveResolveMedia}
                  onOpenMedia={onOpenMedia}
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
