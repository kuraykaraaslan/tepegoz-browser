import { useEffect, useMemo, useState } from 'react';
import { useT } from '@tepegoz/i18n/react';
import type { ChatContact, ChatConversation } from '@tepegoz/shared-types';
import { Avatar } from './Avatar';
import { chatUiDict } from './i18n';
import { ProtocolBadge } from './ProtocolBadge';
import { RoomBrowser } from './RoomBrowser';
import { contactDisplayName, filterRoster } from './roster';
import { conversationTitle, filterConversations, type ChatAccountRef } from './conversation-list';
import type { RoomListing } from './room-browser';

/**
 * Every way to start something new, in one place: pick an existing contact, jump into an
 * already-joined room, browse a directory for a new one, or start a chat with a raw address. Replaces
 * the old standalone "Find a room" tab — that functionality now lives in the Rooms tab below, scoped
 * to whichever account the user picks rather than implicitly whatever conversation happens to be open.
 */

export interface NewChatDialogProps {
  /** The unified roster, across every account. */
  contacts: readonly ChatContact[];
  /** Every configured account — resolves each row's protocol badge / account label. */
  accounts: readonly ChatAccountRef[];
  /** Already-joined rooms, across every account — the quick "your rooms" list. */
  joinedRooms: readonly ChatConversation[];
  /** Open a 1:1 conversation with a contact (closes the dialog). */
  onOpenContact: (contact: ChatContact) => void;
  /** Open an already-joined room (closes the dialog). */
  onOpenRoom: (conversation: ChatConversation) => void;
  /** Start a conversation with a raw address under one account (closes the dialog). Deliberately
   *  address-shaped rather than phone-number-shaped — a future phone lookup slots into this same
   *  handler rather than replacing it. */
  onStartByAddress: (accountId: string, address: string) => void;
  onClose: () => void;
  /** Room discovery (XEP-0030) — absent when the port supports no rooms at all. */
  discoverRooms?: (accountId: string, service: string) => Promise<RoomListing[]>;
  /** Join a discovered (or by-address) room under the given account. */
  onJoinRoom?: (accountId: string, roomJid: string) => Promise<void>;
  /** Which of `accounts` can browse a room directory (XMPP only, today) — drives the account picker
   *  in the discovery section; an account outside this list still gets "join by address" via
   *  `<RoomBrowser>`'s `canBrowse={false}` state. */
  browsableAccountIds?: ReadonlySet<string>;
}

type Tab = 'contacts' | 'rooms' | 'address';

/** A room whose display name collides with another account's — always show the account label
 *  underneath every room row (a fixed cost, not a detection step) so a name collision never reads as
 *  "duplicate" or "which one is this" the way it would if the label only appeared sometimes. */
function AccountCaption({ account }: Readonly<{ account: ChatAccountRef | undefined }>) {
  if (account === undefined) return null;
  return <span className="chat-new-chat__account-caption">{account.label}</span>;
}

export function NewChatDialog({
  contacts,
  accounts,
  joinedRooms,
  onOpenContact,
  onOpenRoom,
  onStartByAddress,
  onClose,
  discoverRooms,
  onJoinRoom,
  browsableAccountIds = new Set(),
}: Readonly<NewChatDialogProps>) {
  const s = useT(chatUiDict);
  const [tab, setTab] = useState<Tab>('contacts');
  const [contactQuery, setContactQuery] = useState('');
  const [roomQuery, setRoomQuery] = useState('');
  const [addressAccountId, setAddressAccountId] = useState(accounts[0]?.id ?? '');
  const [address, setAddress] = useState('');
  const browsable = useMemo(
    () => accounts.filter((a) => browsableAccountIds.has(a.id)),
    [accounts, browsableAccountIds],
  );
  const [discoverAccountId, setDiscoverAccountId] = useState(browsable[0]?.id ?? accounts[0]?.id ?? '');

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const accountById = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);
  const filteredContacts = useMemo(() => filterRoster(contacts, contactQuery), [contacts, contactQuery]);
  const filteredRooms = useMemo(() => filterConversations(joinedRooms, roomQuery), [joinedRooms, roomQuery]);

  const discoverAccount = accountById.get(discoverAccountId);
  const addressTarget = addressAccountId || accounts[0]?.id;
  // Only XMPP has a directory to browse (XEP-0030) — IRC's channel name and Matrix's room alias are
  // both still joinable by address, just worded for their own address shape rather than an XMPP JID.
  const discoverAddressPlaceholder =
    discoverAccount?.protocol === 'irc'
      ? s.roomBrowser.joinByAddressPlaceholderIrc
      : discoverAccount?.protocol === 'matrix'
        ? s.roomBrowser.joinByAddressPlaceholderMatrix
        : undefined;

  return (
    <div
      className="chat-new-chat__backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="chat-new-chat" role="dialog" aria-modal="true" aria-label={s.newChat.title}>
        <div className="chat-new-chat__head">
          <h2>{s.newChat.title}</h2>
          <button type="button" className="chat-new-chat__close" aria-label={s.newChat.close} onClick={onClose}>
            ×
          </button>
        </div>

        <div className="chat-new-chat__tabs" role="tablist">
          <button type="button" role="tab" aria-selected={tab === 'contacts'} onClick={() => setTab('contacts')}>
            {s.newChat.tabContacts}
          </button>
          <button type="button" role="tab" aria-selected={tab === 'rooms'} onClick={() => setTab('rooms')}>
            {s.newChat.tabRooms}
          </button>
          <button type="button" role="tab" aria-selected={tab === 'address'} onClick={() => setTab('address')}>
            {s.newChat.tabAddress}
          </button>
        </div>

        {tab === 'contacts' && (
          <div className="chat-new-chat__panel">
            <input
              type="search"
              value={contactQuery}
              placeholder={s.newChat.searchContacts}
              aria-label={s.newChat.searchContacts}
              onChange={(e) => setContactQuery(e.target.value)}
            />
            {filteredContacts.length === 0 ? (
              <p className="chat-new-chat__empty">{s.newChat.noContacts}</p>
            ) : (
              <ul className="chat-new-chat__list">
                {filteredContacts.map((contact) => {
                  const account = accountById.get(contact.accountId);
                  return (
                    <li key={contact.id}>
                      <button
                        type="button"
                        className="chat-new-chat__row"
                        onClick={() => {
                          onOpenContact(contact);
                          onClose();
                        }}
                      >
                        <span className="chat-new-chat__avatar">
                          <Avatar name={contactDisplayName(contact)} seed={contact.address || contact.id} size="sm" />
                          {account?.protocol !== undefined && <ProtocolBadge protocol={account.protocol} />}
                        </span>
                        <span className="chat-new-chat__row-main">
                          <span className="chat-new-chat__name">{contactDisplayName(contact)}</span>
                          <AccountCaption account={account} />
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}

        {tab === 'rooms' && (
          <div className="chat-new-chat__panel">
            <h3>{s.newChat.yourRooms}</h3>
            <input
              type="search"
              value={roomQuery}
              placeholder={s.newChat.searchRooms}
              aria-label={s.newChat.searchRooms}
              onChange={(e) => setRoomQuery(e.target.value)}
            />
            {filteredRooms.length === 0 ? (
              <p className="chat-new-chat__empty">{s.newChat.noRooms}</p>
            ) : (
              <ul className="chat-new-chat__list">
                {filteredRooms.map((room) => {
                  const account = accountById.get(room.accountId);
                  return (
                    <li key={room.id}>
                      <button
                        type="button"
                        className="chat-new-chat__row"
                        onClick={() => {
                          onOpenRoom(room);
                          onClose();
                        }}
                      >
                        <span className="chat-new-chat__avatar">
                          <Avatar name={conversationTitle(room)} seed={room.id} size="sm" />
                          {account?.protocol !== undefined && <ProtocolBadge protocol={account.protocol} />}
                        </span>
                        <span className="chat-new-chat__row-main">
                          <span className="chat-new-chat__name">{conversationTitle(room)}</span>
                          <AccountCaption account={account} />
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}

            <h3>{s.newChat.discoverRooms}</h3>
            {discoverRooms === undefined || onJoinRoom === undefined || accounts.length === 0 ? (
              <p className="chat-new-chat__empty">{s.newChat.discoverUnavailable}</p>
            ) : (
              <>
                {accounts.length > 1 && (
                  <select
                    value={discoverAccountId}
                    aria-label={s.newChat.discoverAccount}
                    onChange={(e) => setDiscoverAccountId(e.target.value)}
                  >
                    {accounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.label}
                      </option>
                    ))}
                  </select>
                )}
                {discoverAccountId !== '' && (
                  <RoomBrowser
                    key={discoverAccountId}
                    discoverRooms={(service) => discoverRooms(discoverAccountId, service)}
                    onJoin={(roomJid) => onJoinRoom(discoverAccountId, roomJid).then(() => onClose())}
                    canBrowse={discoverAccount !== undefined && browsableAccountIds.has(discoverAccount.id)}
                    {...(discoverAddressPlaceholder !== undefined
                      ? { addressPlaceholder: discoverAddressPlaceholder }
                      : {})}
                  />
                )}
              </>
            )}
          </div>
        )}

        {tab === 'address' && (
          <form
            className="chat-new-chat__panel chat-new-chat__address"
            onSubmit={(e) => {
              e.preventDefault();
              const trimmed = address.trim();
              if (trimmed === '' || addressTarget === undefined) return;
              onStartByAddress(addressTarget, trimmed);
              onClose();
            }}
          >
            {accounts.length > 1 && (
              <label>
                {s.newChat.addressAccount}
                <select
                  value={addressAccountId}
                  aria-label={s.newChat.addressAccount}
                  onChange={(e) => setAddressAccountId(e.target.value)}
                >
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.label}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label>
              {s.newChat.addressLabel}
              <input
                value={address}
                placeholder={s.newChat.addressPlaceholder}
                aria-label={s.newChat.addressLabel}
                onChange={(e) => setAddress(e.target.value)}
              />
            </label>
            <button type="submit" disabled={address.trim() === '' || addressTarget === undefined}>
              {s.newChat.start}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
