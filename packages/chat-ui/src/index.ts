/**
 * `@tepegoz/chat-ui` — the presentational surface for the multi-protocol messenger (`@tepegoz/ext-chat`,
 * phase X-chat.2): conversation list, message timeline, composer, roster, account setup. A renderer
 * leaf — it takes data and callbacks, never imports back into the app or Electron, and self-localizes
 * through its own dictionary.
 */

export { chatUiDict, type ChatUiStrings } from './i18n';
export { linkifySegments, MAX_LINK_SEGMENTS, type LinkSegment } from './linkify';
export {
  startOfDay,
  isSameDay,
  formatClockTime,
  groupByDay,
  daySeparatorLabel,
  type DayGroup,
} from './time';
export { buildTimeline, type TimelineItem, type BuildTimelineOptions } from './timeline';
export { MessageTimeline, QUOTE_SNIPPET_MAX, type MessageTimelineProps } from './MessageTimeline';
export {
  mediaCategory,
  isLocalMediaUrl,
  isSafeMediaResource,
  type MediaCategory,
  type MediaResource,
} from './media';
export { MessageMedia, type MessageMediaProps, type ResolveMedia } from './MessageMedia';
export {
  findMentionQuery,
  rankMentionCandidates,
  applyMention,
  type MentionQuery,
} from './mention-autocomplete';
export { RoomMemberList, type RoomMemberListProps } from './RoomMemberList';
export { RoomHeader, type RoomHeaderProps } from './RoomHeader';
export { NotEncryptedBadge } from './NotEncryptedBadge';
export { roomTypingLabel, typingName, type TypingStrings } from './typing';
export {
  filterRoomListings,
  sortRoomListings,
  roomListingLabel,
  type RoomListing,
} from './room-browser';
export { RoomBrowser, type RoomBrowserProps } from './RoomBrowser';
export {
  isSendKey,
  draftToBody,
  canSend,
  isOverLimit,
  remainingChars,
  CHAT_COMPOSER_WARN_REMAINING,
  type SendKeyEvent,
} from './composer-draft';
export { Composer, type ComposerProps, type ComposerSubmission } from './Composer';
export {
  deriveAccountId,
  emptyAccountForm,
  validateXmppAccountForm,
  type AccountFormState,
  type AccountFormField,
  type AccountFormErrors,
  type AccountFormResult,
} from './account-form';
export {
  AccountSetupForm,
  type AccountSetupFormProps,
  type AccountSetupResult,
} from './AccountSetupForm';
export {
  ROSTER_UNGROUPED,
  contactDisplayName,
  filterRoster,
  groupRoster,
  onlineCount,
  type RosterGroup,
} from './roster';
export { RosterPanel, type RosterPanelProps } from './RosterPanel';
export {
  emptyChatClientState,
  seedConversations,
  seedRoster,
  seedHistory,
  patchConversation,
  applyChatChange,
  applyChatChanges,
  type ChatClientState,
} from './chat-store';
export { useChatState, type UseChatState } from './useChatState';
export { ChatWorkspace, type ChatWorkspaceProps } from './ChatWorkspace';
export type {
  ChatAccountSummary,
  ChatAccountsSnapshot,
  ChatHistoryPage,
  ChatStateEvent,
  ChatClientPort,
} from './types';
export { presenceMeta, type PresenceMeta, type PresenceTone } from './presence';
export { PresenceBadge, type PresenceBadgeProps } from './PresenceBadge';
export {
  conversationTitle,
  sortConversations,
  totalUnread,
  totalMentions,
  groupConversationsByAccount,
  type ChatAccountRef,
  type AccountGroup,
} from './conversation-list';
export { ConversationList, type ConversationListProps } from './ConversationList';
