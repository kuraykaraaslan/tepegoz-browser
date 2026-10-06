import { useT } from '@tepegoz/i18n/react';
import type { ChatContact, ChatConversation } from '@tepegoz/shared-types';
import { chatUiDict } from './i18n';
import { ConversationList } from './ConversationList';
import { RosterPanel } from './RosterPanel';
import { GearIcon, NewChatIcon } from './chat-workspace-icons';
import type { ChatAccountRef } from './conversation-list';
import type { UseChatState } from './useChatState';

export type ChatWorkspaceLeftTab = 'chats' | 'contacts';

export interface ChatWorkspaceSidebarProps {
  chat: UseChatState;
  tab: ChatWorkspaceLeftTab;
  onTabChange: (tab: ChatWorkspaceLeftTab) => void;
  noAccounts: boolean;
  onAddAccount?: (() => void) | undefined;
  onNewChat: () => void;
  onManageAccounts: () => void;
  showArchived: boolean;
  onToggleArchived: () => void;
  archivedCount: number;
  visibleConversations: readonly ChatConversation[];
  accountRefs: readonly ChatAccountRef[];
  rosterList: readonly ChatContact[];
  contactByAddress: ReadonlyMap<string, ChatContact>;
  onOpenContact: (contact: ChatContact) => void;
}

/** The left column: title + new-chat / manage-accounts actions, the Chats / Contacts tabs and the
 *  list for the selected tab. */
export function ChatWorkspaceSidebar({
  chat,
  tab,
  onTabChange,
  noAccounts,
  onAddAccount,
  onNewChat,
  onManageAccounts,
  showArchived,
  onToggleArchived,
  archivedCount,
  visibleConversations,
  accountRefs,
  rosterList,
  contactByAddress,
  onOpenContact,
}: Readonly<ChatWorkspaceSidebarProps>) {
  const s = useT(chatUiDict);
  return (
    <aside className="chat-workspace__left">
      <div className="chat-workspace__left-head">
        <span className="chat-workspace__left-title">{s.workspace.title}</span>
        <span className="chat-workspace__left-actions">
          <button
            type="button"
            className="chat-workspace__icon-btn"
            aria-label={s.workspace.newChat}
            title={s.workspace.newChat}
            onClick={() => onNewChat()}
          >
            <NewChatIcon />
          </button>
          <button
            type="button"
            className="chat-workspace__icon-btn"
            aria-label={s.workspace.manageAccounts}
            title={s.workspace.manageAccounts}
            onClick={() => onManageAccounts()}
          >
            <GearIcon />
          </button>
        </span>
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
          onClick={() => onTabChange('chats')}
        >
          {s.workspace.chatsTab}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'contacts'}
          onClick={() => onTabChange('contacts')}
        >
          {s.workspace.contactsTab}
        </button>
      </div>

      {tab === 'chats' && (
        <>
          {(showArchived || archivedCount > 0) && (
            <button
              type="button"
              className="chat-workspace__archived-toggle"
              onClick={() => onToggleArchived()}
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
              c.kind === 'dm' ? (contactByAddress.get(c.address)?.presence ?? null) : null
            }
          />
        </>
      )}
      {tab === 'contacts' && (
        <RosterPanel
          contacts={rosterList}
          accounts={accountRefs}
          onOpenContact={onOpenContact}
          {...(chat.addContact !== null
            ? {
                onAddContact: (accountId: string, address: string) =>
                  chat.addContact?.(accountId, address),
              }
            : {})}
          {...(chat.removeContact !== null
            ? {
                onRemoveContact: (contact) =>
                  chat.removeContact?.(contact.accountId, contact.address),
              }
            : {})}
          {...(chat.blockContact !== null
            ? {
                onToggleBlock: (contact: ChatContact) =>
                  chat.blockContact?.(contact.accountId, contact.address, !contact.blocked),
              }
            : {})}
        />
      )}
    </aside>
  );
}
