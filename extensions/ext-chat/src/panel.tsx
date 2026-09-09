import { Button, Card } from '@tepegoz/ui';
import { useT } from '@tepegoz/i18n/react';
import { chatDict } from './i18n';

/**
 * Placeholder surfaces for the Chat extension (X-chat.1 scaffold). The protocol engine
 * (`@tepegoz/chat-adapters`) and the connection lifecycle (`@tepegoz/chat-core`) are built; account
 * setup, the roster, and the conversation view are X-chat.2. These render a localized status card so
 * the extension is a real, enable-able entry in the meantime.
 */

export interface ChatSurfaceProps {
  api: unknown;
  onClose: () => void;
}

function ComingSoon({ onClose, compact }: Readonly<{ onClose: () => void; compact?: boolean }>) {
  const s = useT(chatDict);
  return (
    <Card>
      <h2>{s.comingSoonTitle}</h2>
      <p>{s.comingSoonBody}</p>
      {compact !== true && (
        <>
          <h3>{s.protocols.heading}</h3>
          <ul>
            <li>{s.protocols.xmpp}</li>
            <li>{s.protocols.irc}</li>
            <li>{s.protocols.matrix}</li>
            <li>{s.protocols.bridges}</li>
          </ul>
        </>
      )}
      <Button onClick={onClose}>{s.close}</Button>
    </Card>
  );
}

export function ChatSidebar({ onClose }: Readonly<ChatSurfaceProps>) {
  return <ComingSoon onClose={onClose} compact />;
}

export function ChatPage({ onClose }: Readonly<ChatSurfaceProps>) {
  return <ComingSoon onClose={onClose} />;
}
