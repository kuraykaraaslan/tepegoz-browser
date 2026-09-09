/**
 * `@tepegoz/chat-core` — the Electron-free, protocol-agnostic heart of the multi-protocol messenger
 * (`@tepegoz/ext-chat`, phase X-chat.0). The "prpl abstraction": adapters speak their wire, this
 * normalizes, folds, orders, and counts; the desktop `ChatService` injects the sockets.
 */

export {
  parseJid,
  bareJid,
  formatJid,
  parseIrcPrefix,
  parseMatrixId,
  type Jid,
  type IrcPrefix,
  type MatrixId,
  type MatrixIdKind,
} from './address';

export { normalizeEvent, normalizeEvents, type NormalizeResult } from './normalize';

export {
  emptyConversation,
  foldEvent,
  foldEvents,
  reconcileEcho,
  markRead,
  type ConversationView,
  type FoldOptions,
} from './conversation';

export {
  CHAT_SEND_STATES,
  MAX_SEND_ATTEMPTS,
  backoffMs,
  enqueueSend,
  markSending,
  markSent,
  markFailed,
  dueSends,
  pruneSends,
  deadSends,
  type QueuedSend,
  type ChatSendState,
} from './send-queue';

export { scanMentions, isMention, type MentionScan } from './mentions';

export { foldForSearch, tokenize, foldedIncludes } from './search-fold';
