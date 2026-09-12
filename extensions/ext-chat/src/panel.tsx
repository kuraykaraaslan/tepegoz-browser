import { useState } from 'react';
import { AccountSetupForm, ChatWorkspace, type ChatClientPort } from '@tepegoz/chat-ui';
import type { ChatAccount } from '@tepegoz/shared-types';

/**
 * The Chat extension surfaces (X-chat.2). Both the sidebar and the internal page render the same
 * `<ChatWorkspace>` — accounts, roster, conversation list, timeline, composer — over the injected
 * host bridge. The add/edit-account flow swaps in `<AccountSetupForm>`; the plaintext secret it
 * produces crosses to `addChatAccount` / `updateChatAccount` once and is stored by the main process
 * in the OS keychain.
 */

export type ChatHostApi = ChatClientPort & {
  addChatAccount: (account: ChatAccount, secret: string) => Promise<void>;
  /** Full (non-secret) config for the edit form. `null` if the account no longer exists. */
  getChatAccount: (accountId: string) => Promise<Omit<ChatAccount, 'secretRef'> | null>;
  /** `secret: null` keeps the vault's existing credential — see `AccountSetupForm`'s edit mode. */
  updateChatAccount: (account: ChatAccount, secret: string | null) => Promise<void>;
};

export interface ChatSurfaceProps {
  api: ChatHostApi;
  onClose: () => void;
}

type FormMode = { kind: 'add' } | { kind: 'edit'; account: Omit<ChatAccount, 'secretRef'> };

function ChatSurface({ api }: Readonly<{ api: ChatHostApi }>) {
  const [mode, setMode] = useState<FormMode | null>(null);

  if (mode !== null) {
    return (
      <AccountSetupForm
        {...(mode.kind === 'edit' ? { existingAccount: mode.account } : {})}
        onCancel={() => setMode(null)}
        onAdd={async ({ account, secret }) => {
          const withMeta = { ...account, secretRef: `chat:${account.id}`, updatedAt: Date.now(), version: 1 };
          if (mode.kind === 'edit') {
            await api.updateChatAccount(withMeta, secret);
          } else {
            // Add mode never leaves `secret` null (only editing-with-a-blank-password does) — the
            // fallback is unreachable in practice, just satisfying `addChatAccount`'s non-null secret.
            await api.addChatAccount(withMeta, secret ?? '');
          }
          setMode(null);
        }}
      />
    );
  }

  return (
    <ChatWorkspace
      port={api}
      onAddAccount={() => setMode({ kind: 'add' })}
      onEditAccount={(accountId) => {
        void api.getChatAccount(accountId).then((account) => {
          if (account !== null) setMode({ kind: 'edit', account });
        });
      }}
    />
  );
}

export function ChatSidebar({ api }: Readonly<ChatSurfaceProps>) {
  return <ChatSurface api={api} />;
}

export function ChatPage({ api }: Readonly<ChatSurfaceProps>) {
  return <ChatSurface api={api} />;
}
