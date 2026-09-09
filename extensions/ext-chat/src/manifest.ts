import { defineExtension } from '@tepegoz/extension-sdk';

/**
 * The multi-protocol messenger extension manifest (`phases/extensions/ext-chat.md`). Validated
 * against the SDK schema at module load. It surfaces as a resizable sidebar ("Chat" — conversation
 * list + active conversation beside the page) and an internal page (`tepegoz://com.tepegoz.chat` —
 * the full messenger: roster, rooms, multi-account).
 *
 * Its agent-callable capabilities (`chat_*`, ADR-0047) and the desktop `ChatService` host land in
 * later X-chat.1 slices; the manifest stays UI-only.
 */
export const chatManifest = defineExtension({
  id: 'com.tepegoz.chat',
  name: 'Chat',
  version: '0.1.0',
  description:
    'A multi-protocol messenger — XMPP, IRC and Matrix natively, bridged networks later, all on one roster.',
  icon: 'comments',
  surfaces: ['sidebar', 'page'],
  actions: { click: 'sidebar', doubleClick: 'page' },
  labels: {
    tr: {
      name: 'Sohbet',
      description:
        'Çok protokollü mesajlaşma — XMPP, IRC ve Matrix yerel; köprülenen ağlar sonra, hepsi tek kişi listesinde.',
    },
  },
  permissions: ['accounts', 'background-connection', 'notifications', 'contacts'],
});
