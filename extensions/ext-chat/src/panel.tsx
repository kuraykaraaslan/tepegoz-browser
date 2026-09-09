import { useState } from 'react';
import { AccountSetupForm, ChatWorkspace, type ChatClientPort } from '@tepegoz/chat-ui';
import type { ChatAccount } from '@tepegoz/shared-types';

/**
 * The Chat extension surfaces (X-chat.2). Both the sidebar and the internal page render the same
 * `<ChatWorkspace>` — accounts, roster, conversation list, timeline, composer — over the injected
 * host bridge. The add-account flow swaps in `<AccountSetupForm>`; the plaintext secret it produces
 * crosses to `addChatAccount` once and is stored by the main process in the OS keychain.
 */

export type ChatHostApi = ChatClientPort & {
  addChatAccount: (account: ChatAccount, secret: string) => Promise<void>;
};

export interface ChatSurfaceProps {
  api: ChatHostApi;
  onClose: () => void;
}

function ChatSurface({ api }: Readonly<{ api: ChatHostApi }>) {
  const [adding, setAdding] = useState(false);

  if (adding) {
    return (
      <AccountSetupForm
        onCancel={() => {
          setAdding(false);
        }}
        onAdd={async ({ account, secret }) => {
          await api.addChatAccount(
            { ...account, secretRef: `chat:${account.id}`, updatedAt: Date.now(), version: 1 },
            secret,
          );
          setAdding(false);
        }}
      />
    );
  }

  return (
    <ChatWorkspace
      port={api}
      onAddAccount={() => {
        setAdding(true);
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
