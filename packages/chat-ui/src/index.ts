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
  groupByDay,
  daySeparatorLabel,
  type DayGroup,
} from './time';
export { presenceMeta, type PresenceMeta, type PresenceTone } from './presence';
export { PresenceBadge, type PresenceBadgeProps } from './PresenceBadge';
