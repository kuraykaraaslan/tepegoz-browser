import { useMemo, useState } from 'react';
import { useT } from '@tepegoz/i18n/react';
import type { ChatContact, ChatConversation, ChatMessage } from '@tepegoz/shared-types';
import { chatUiDict } from './i18n';
import { Composer } from './Composer';
import { ConversationList } from './ConversationList';
import { MessageTimeline } from './MessageTimeline';
import { RosterPanel } from './RosterPanel';
import { conversationTitle, type ChatAccountRef } from './conversation-list';
import type { ResolveMedia } from './MessageMedia';
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

type LeftTab = 'chats' | 'contacts';

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

  if (!chat.loading && chat.accounts.length === 0) {
    return (
      <div className="chat-workspace chat-workspace--empty">
        <p>{s.workspace.noAccounts}</p>
        {onAddAccount !== undefined && (
          <button type="button" onClick={onAddAccount}>
            {s.roster.add}
          </button>
        )}
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
          </div>

          {tab === 'chats' ? (
            <ConversationList
              conversations={chat.conversations}
              accounts={accountRefs}
              selectedId={chat.selectedConversationId}
              onSelect={chat.selectConversation}
              presenceOf={(c) =>
                c.kind === 'dm' ? contactByAddress.get(c.address)?.presence ?? null : null
              }
            />
          ) : (
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
        </aside>

        <section className="chat-workspace__main">
          {selected === undefined ? (
            <p className="chat-workspace__no-selection">{s.workspace.noSelection}</p>
          ) : (
            <>
              <header className="chat-workspace__conv-head">
                <h2>{conversationTitle(selected)}</h2>
                {typing.length > 0 && (
                  <span className="chat-workspace__typing">{s.workspace.typing}</span>
                )}
              </header>
              <MessageTimeline
                messages={messages}
                lastReadId={selected.lastReadId}
                isOwn={(m) => selected.kind === 'dm' && m.senderAddress !== selected.address}
                resolveMedia={resolveMedia}
                onOpenMedia={onOpenMedia}
              />
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
