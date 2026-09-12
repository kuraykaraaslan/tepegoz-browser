import { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faGear, faTrash } from '@fortawesome/free-solid-svg-icons';
import { useT } from '@tepegoz/i18n/react';
import type { ChatConnState } from '@tepegoz/chat-core';
import { chatUiDict } from './i18n';
import { ACCOUNT_FORM_PROTOCOLS } from './account-form';
import type { PresenceTone } from './presence';
import { Avatar } from './Avatar';
import { ProtocolBadge } from './ProtocolBadge';
import type { ChatAccountSummary } from './types';

const CONN_TONE: Record<ChatConnState, PresenceTone> = {
  idle: 'neutral',
  stopped: 'neutral',
  connecting: 'caution',
  reconnecting: 'caution',
  online: 'positive',
  error: 'busy',
  blocked: 'busy',
};

export interface AccountsManagerProps {
  accounts: readonly ChatAccountSummary[];
  connectionStates: Readonly<Record<string, ChatConnState>>;
  /** Open the add-account flow — optional; the button is hidden without it. */
  onAdd?: (() => void) | undefined;
  /** Open the edit flow for one account — optional; the row's edit button is hidden without it.
   *  Also hidden for a `bridge` account (X-chat.8/.9), which this form cannot edit — none exist
   *  yet, but the guard costs nothing and saves a future dead click. */
  onEdit?: ((accountId: string) => void) | undefined;
  /** Remove an account — optional; the row's remove button is hidden without it. */
  onRemove?: ((accountId: string) => void) | undefined;
  onClose: () => void;
}

/**
 * The Pidgin-style "Accounts" window: every configured account with its live connection state, a
 * remove action per row, and an entry point into {@link AccountSetupForm}. Reachable from the
 * workspace's gear icon — until this existed, a single configured account had no visible confirmation
 * anywhere in the UI (the account switcher only renders once a second account exists).
 */
export function AccountsManager({
  accounts,
  connectionStates,
  onAdd,
  onEdit,
  onRemove,
  onClose,
}: Readonly<AccountsManagerProps>) {
  const s = useT(chatUiDict);
  // Two-click remove (no modal system in this surface) — armed holds the id awaiting confirmation.
  const [armed, setArmed] = useState<string | null>(null);

  return (
    <div className="chat-accounts-manager">
      <header className="chat-accounts-manager__head">
        <button type="button" className="chat-accounts-manager__close" onClick={onClose}>
          <span aria-hidden="true">‹</span> {s.accountsManager.back}
        </button>
        <h2>{s.accountsManager.title}</h2>
      </header>

      {accounts.length === 0 ? (
        <p className="chat-accounts-manager__empty">{s.accountsManager.empty}</p>
      ) : (
        <ul className="chat-accounts-manager__list">
          {accounts.map((account) => {
            const connState = connectionStates[account.id] ?? 'idle';
            const tone = CONN_TONE[connState];
            const isArmed = armed === account.id;
            return (
              <li key={account.id} className="chat-accounts-manager__row">
                <span className="chat-accounts-manager__avatar">
                  <Avatar name={account.label} seed={account.id} />
                  <ProtocolBadge protocol={account.protocol} />
                </span>
                <span className="chat-accounts-manager__info">
                  <span className="chat-accounts-manager__label">{account.label}</span>
                  <span className="chat-presence" data-tone={tone}>
                    <span className="chat-presence__dot" aria-hidden="true" />
                    <span className="chat-presence__label">{s.accountsManager.connState[connState]}</span>
                  </span>
                </span>
                {onEdit !== undefined &&
                  (ACCOUNT_FORM_PROTOCOLS as readonly string[]).includes(account.protocol) && (
                    <button
                      type="button"
                      className="chat-accounts-manager__edit"
                      onClick={() => onEdit(account.id)}
                    >
                      <FontAwesomeIcon icon={faGear} aria-hidden="true" />
                      {s.accountsManager.edit}
                    </button>
                  )}
                {onRemove !== undefined && (
                  <button
                    type="button"
                    className="chat-accounts-manager__remove"
                    data-armed={isArmed}
                    onClick={() => {
                      if (isArmed) {
                        onRemove(account.id);
                        setArmed(null);
                      } else {
                        setArmed(account.id);
                      }
                    }}
                    onBlur={() => setArmed((current) => (current === account.id ? null : current))}
                  >
                    <FontAwesomeIcon icon={faTrash} aria-hidden="true" />
                    {isArmed ? s.accountsManager.removeConfirm : s.accountsManager.remove}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {onAdd !== undefined && (
        <button type="button" className="chat-accounts-manager__add" onClick={onAdd}>
          {s.accountsManager.add}
        </button>
      )}
    </div>
  );
}
