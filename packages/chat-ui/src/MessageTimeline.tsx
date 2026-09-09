import { useLocale, useT } from '@tepegoz/i18n/react';
import type { ChatMessage } from '@tepegoz/shared-types';
import { chatUiDict, type ChatUiStrings } from './i18n';
import { linkifySegments } from './linkify';
import { MessageMedia, type ResolveMedia } from './MessageMedia';
import { buildTimeline, type BuildTimelineOptions } from './timeline';
import { daySeparatorLabel, formatClockTime } from './time';

export interface MessageTimelineProps {
  messages: readonly ChatMessage[];
  /** `id` of the last read message — positions the "new messages" divider. */
  lastReadId?: string | null;
  /** Host clock, injected so "Today" is the viewer's today. Defaults to `Date.now()`. */
  now?: number;
  /** True for messages the local user sent — surfaces the delivery state. */
  isOwn?: (message: ChatMessage) => boolean;
  /**
   * Open a link the user clicked. The timeline never navigates on its own and never fetches a URL;
   * absent this callback, links render as inert text.
   */
  onOpenLink?: (href: string) => void;
  /**
   * Resolve a message's `mediaRef` to a LOCAL resource (host reads the quarantined part). Absent ⇒
   * attachments are not rendered. The timeline never fetches a remote URL for a preview.
   */
  resolveMedia?: ResolveMedia | undefined;
  onOpenMedia?: ((mediaRef: string) => void) | undefined;
  groupWindowMs?: BuildTimelineOptions<ChatMessage>['groupWindowMs'];
}

function MessageBody({
  message,
  strings,
  onOpenLink,
}: Readonly<{
  message: ChatMessage;
  strings: ChatUiStrings;
  onOpenLink: ((href: string) => void) | undefined;
}>) {
  if (message.redacted) {
    return <span className="chat-msg__redacted">{strings.timeline.redacted}</span>;
  }
  return (
    <span className="chat-msg__body">
      {linkifySegments(message.body).map((segment, i) =>
        segment.kind === 'link' && onOpenLink !== undefined ? (
          <a
            key={i}
            className="chat-msg__link"
            href={segment.href}
            rel="noreferrer noopener"
            onClick={(e) => {
              e.preventDefault();
              onOpenLink(segment.href);
            }}
          >
            {segment.value}
          </a>
        ) : (
          <span key={i}>{segment.value}</span>
        ),
      )}
      {message.editedAt !== null && (
        <span className="chat-msg__edited"> ({strings.timeline.edited})</span>
      )}
    </span>
  );
}

function Reactions({ message }: Readonly<{ message: ChatMessage }>) {
  if (message.reactions.length === 0) return null;
  return (
    <span className="chat-msg__reactions">
      {message.reactions.map((r) => (
        <span key={r.emoji} className="chat-msg__reaction" data-me={r.me}>
          {r.emoji} {r.count}
        </span>
      ))}
    </span>
  );
}

/**
 * The message timeline: day separators, a single "new messages" divider, and consecutive same-sender
 * messages collapsed under one header. Text is linkified but never auto-navigated; media / reply
 * quoting land in a later slice.
 */
export function MessageTimeline({
  messages,
  lastReadId = null,
  now = Date.now(),
  isOwn,
  onOpenLink,
  resolveMedia,
  onOpenMedia,
  groupWindowMs,
}: Readonly<MessageTimelineProps>) {
  const s = useT(chatUiDict);
  const locale = useLocale();
  const items = buildTimeline(messages, {
    lastReadId,
    ...(groupWindowMs !== undefined ? { groupWindowMs } : {}),
  });

  return (
    <ol className="chat-timeline">
      {items.map((item) => {
        if (item.kind === 'day') {
          return (
            <li key={item.key} className="chat-timeline__day" role="separator">
              {daySeparatorLabel(item.day, now, s.day, locale)}
            </li>
          );
        }
        if (item.kind === 'unread-divider') {
          return (
            <li key={item.key} className="chat-timeline__unread" role="separator">
              {s.timeline.newMessages}
            </li>
          );
        }
        const { message, startsGroup } = item;
        const own = isOwn?.(message) ?? false;
        const senderName = message.senderName.trim() || message.senderAddress;
        return (
          <li
            key={item.key}
            className="chat-msg"
            data-kind={message.kind}
            data-own={own}
            data-starts-group={startsGroup}
          >
            {startsGroup && (
              <span className="chat-msg__meta">
                <span className="chat-msg__sender">{senderName}</span>
                <time className="chat-msg__time">
                  {formatClockTime(message.originTs || message.receivedAt, locale)}
                </time>
              </span>
            )}
            {(message.body !== '' || message.redacted) && (
              <MessageBody message={message} strings={s} onOpenLink={onOpenLink} />
            )}
            {message.mediaRef !== null && resolveMedia !== undefined && (
              <MessageMedia
                mediaRef={message.mediaRef}
                resolveMedia={resolveMedia}
                onOpenMedia={onOpenMedia}
              />
            )}
            <Reactions message={message} />
            {own && (
              <span className="chat-msg__delivery" data-state={message.deliveryState}>
                {s.delivery[message.deliveryState]}
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}
