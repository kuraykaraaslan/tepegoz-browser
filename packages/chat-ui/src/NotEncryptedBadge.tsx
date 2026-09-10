import { useT } from '@tepegoz/i18n/react';
import { chatUiDict } from './i18n';

/**
 * Persistent marker on a conversation whose protocol carries no end-to-end encryption at all — IRC,
 * whose wire is readable by the server, full stop. This is deliberately NOT the same surface as a
 * Matrix / XMPP "encryption is available but this device is unverified" state (X-chat.7): there is no
 * key to verify and nothing the user can do to make an IRC channel private.
 */
export function NotEncryptedBadge() {
  const s = useT(chatUiDict);
  return (
    <span className="chat-not-encrypted" title={s.workspace.ircPlaintext}>
      <span className="chat-not-encrypted__icon" aria-hidden="true" />
      {s.workspace.notEncrypted}
    </span>
  );
}
