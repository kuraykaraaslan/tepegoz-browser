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

export { scanMentions, isMention, isDirectMention, type MentionScan } from './mentions';

export {
  ROOM_NOTIFY_LEVELS,
  decideNotification,
  type RoomNotifyLevel,
  type NotifyReason,
  type NotifyContext,
  type NotifyDecision,
} from './notify';

export { foldForSearch, tokenize, foldedIncludes } from './search-fold';

export {
  ChatConnectionManager,
  reconnectDelayMs,
  type ChatConnState,
  type ConnectionManagerDeps,
  type ManagedAdapter,
  type ManagedSession,
} from './connection-manager';

export { PresenceTracker, type EffectivePresence } from './presence';

export {
  ChatAccountState,
  type ChatAccountStateOptions,
  type ChatStateChange,
} from './account-state';

export {
  CHAT_UNTRUSTED_NOTE,
  wrapChatContent,
  agentMessageView,
  isConversationAgentVisible,
  filterAgentConversations,
  type AgentChatMessage,
} from './agent-view';

export {
  ROOM_AFFILIATIONS,
  ROOM_ROLES,
  emptyRoom,
  applyOccupant,
  applySubject,
  leaveRoom,
  occupantList,
  occupantCount,
  type RoomAffiliation,
  type RoomRole,
  type RoomOccupant,
  type RoomOccupantUpdate,
  type RoomView,
} from './room';
