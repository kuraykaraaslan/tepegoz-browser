import { useLocale, useT } from '@tepegoz/i18n/react';
import type { ChatConversation, ChatPresence } from '@tepegoz/shared-types';
import { Avatar } from './Avatar';
import { chatUiDict, type ChatUiStrings } from './i18n';
import { PresenceBadge } from './PresenceBadge';
import { ProtocolBadge } from './ProtocolBadge';
import { conversationListTime } from './time';
import { conversationTitle, sortConversations, type ChatAccountRef } from './conversation-list';

export interface ConversationListProps {
  conversations: readonly ChatConversation[];
  /** Every configured account — used only to resolve each row's protocol badge; the list itself is
   *  always one flat, most-recent-first feed regardless of account count (which account a row
   *  belongs to shows ONLY via that badge, not a grouping header). */
  accounts: readonly ChatAccountRef[];
  selectedId?: string | null;
  onSelect: (conversationId: string) => void;
  /** DM presence, when known — drives the row's status dot. Rooms return `null`. */
  presenceOf?: (conversation: ChatConversation) => ChatPresence | null;
  /** Host clock, injected so "today" is the viewer's today (drives the time label). Defaults to
   *  `Date.now()`. */
  now?: number;
}

/** A one-line preview of a conversation's most recent message, for the list row. `null` (a brand-new
 *  conversation with nothing sent yet) renders as no preview at all rather than empty text. */
function previewText(conversation: ChatConversation, strings: ChatUiStrings): string | null {
  const last = conversation.lastMessage;
  if (last === null) return null;
  if (last.redacted) return strings.timeline.redacted;
  if (last.body.trim() === '') return strings.timeline.quoteAttachment;
  return last.body;
}

function CountBadge({
  kind,
  value,
  label,
}: Readonly<{ kind: string; value: number; label: string }>) {
  if (value <= 0) return null;
  return (
    <span className="chat-conv__badge" data-kind={kind} aria-label={`${value} ${label}`}>
      {value > 99 ? '99+' : value}
    </span>
  );
}

function Row({
  conversation,
  selected,
  onSelect,
  presence,
  protocol,
  now,
  locale,
  strings,
}: Readonly<{
  conversation: ChatConversation;
  selected: boolean;
  onSelect: (id: string) => void;
  presence: ChatPresence | null;
  /** The owning account's protocol — omitted when the account isn't in the accounts list. This is
   *  the ONLY place a row shows which account it belongs to (no grouping headers). */
  protocol?: string | undefined;
  now: number;
  locale: string | undefined;
  strings: ChatUiStrings;
}>) {
  const preview = previewText(conversation, strings);
  return (
    <li>
      <button
        type="button"
        className="chat-conv"
        data-kind={conversation.kind}
        data-unread={conversation.unread > 0}
        aria-current={selected ? 'true' : undefined}
        onClick={() => {
          onSelect(conversation.id);
        }}
      >
        <span className="chat-conv__avatar" data-kind={conversation.kind}>
          <Avatar name={conversationTitle(conversation)} seed={conversation.id} />
          {protocol !== undefined && <ProtocolBadge protocol={protocol} />}
          {presence !== null && <PresenceBadge presence={presence} dotOnly />}
        </span>
        <span className="chat-conv__main">
          <span className="chat-conv__row-top">
            <span className="chat-conv__title">{conversationTitle(conversation)}</span>
            {conversation.lastMessage !== null && (
              <time className="chat-conv__time">
                {conversationListTime(conversation.lastMessage.originTs, now, locale)}
              </time>
            )}
          </span>
          <span className="chat-conv__row-bottom">
            {preview !== null && <span className="chat-conv__preview">{preview}</span>}
            {conversation.muted && (
              <span className="chat-conv__muted" title={strings.list.muted} aria-hidden="true" />
            )}
            <CountBadge
              kind="mentions"
              value={conversation.mentions}
              label={strings.list.mentions}
            />
            <CountBadge kind="unread" value={conversation.unread} label={strings.list.unread} />
          </span>
        </span>
      </button>
    </li>
  );
}

/**
 * The conversation list: most-recently-active first, one flat feed spanning every configured
 * account — which account a row belongs to shows ONLY via its avatar's protocol badge, never a
 * grouping header (a second account is not a second section, just more rows in the same list).
 * Purely presentational — selection leaves through `onSelect`. Not yet virtualized; a windowing pass
 * comes when a real account has hundreds of rooms.
 */
export function ConversationList({
  conversations,
  accounts,
  selectedId = null,
  onSelect,
  presenceOf,
  now = Date.now(),
}: Readonly<ConversationListProps>) {
  const s = useT(chatUiDict);
  const locale = useLocale();
  const presence = (c: ChatConversation): ChatPresence | null => presenceOf?.(c) ?? null;
  const accountById = new Map(accounts.map((a) => [a.id, a]));
  const protocolOf = (accountId: string): string | undefined =>
    accountById.get(accountId)?.protocol;

  if (conversations.length === 0) {
    return <p className="chat-conv-list__empty">{s.list.empty}</p>;
  }

  const ordered = sortConversations(conversations);

  return (
    <ul className="chat-conv-list">
      {ordered.map((c) => (
        <Row
          key={c.id}
          conversation={c}
          selected={c.id === selectedId}
          onSelect={onSelect}
          presence={presence(c)}
          protocol={protocolOf(c.accountId)}
          now={now}
          locale={locale}
          strings={s}
        />
      ))}
    </ul>
  );
}
