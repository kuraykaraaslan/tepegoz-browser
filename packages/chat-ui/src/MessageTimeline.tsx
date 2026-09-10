import { useLocale, useT } from '@tepegoz/i18n/react';
import type { ChatMessage } from '@tepegoz/shared-types';
import { Avatar } from './Avatar';
import { chatUiDict, type ChatUiStrings } from './i18n';
import { linkifySegments } from './linkify';
import { MessageMedia, type ResolveMedia } from './MessageMedia';
import { buildTimeline, type BuildTimelineOptions } from './timeline';
import { daySeparatorLabel, formatClockTime } from './time';

/** Longest quoted-reply snippet shown inline before it is trimmed with an ellipsis. */
export const QUOTE_SNIPPET_MAX = 120;

/** Default render window — a very long room keeps only this many most-recent messages in the DOM. */
export const TIMELINE_WINDOW = 200;

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
  /** Scroll to / focus the quoted original when its preview is clicked. Absent ⇒ the quote is inert. */
  onJumpToMessage?: (protocolId: string) => void;
  groupWindowMs?: BuildTimelineOptions<ChatMessage>['groupWindowMs'];
  /** Keep at most this many most-recent messages in the DOM (default {@link TIMELINE_WINDOW}); a
   *  `0` renders everything. Older messages collapse into one "N earlier messages" row. */
  maxMessages?: number;
}

/** A one-line preview of the message a reply points at, when that original is in the loaded window. */
function QuotedReply({
  original,
  strings,
  onJump,
}: Readonly<{
  original: ChatMessage;
  strings: ChatUiStrings;
  onJump: ((protocolId: string) => void) | undefined;
}>) {
  const sender = original.senderName.trim() || original.senderAddress;
  const text = original.redacted
    ? strings.timeline.redacted
    : original.body.length > QUOTE_SNIPPET_MAX
      ? `${original.body.slice(0, QUOTE_SNIPPET_MAX)}…`
      : original.body || strings.timeline.quoteAttachment;
  const inner = (
    <>
      <span className="chat-msg__quote-sender">{sender}</span>
      <span className="chat-msg__quote-text">{text}</span>
    </>
  );
  return onJump !== undefined ? (
    <button
      type="button"
      className="chat-msg__quote"
      aria-label={`${strings.timeline.inReplyTo} ${sender}`}
      onClick={() => onJump(original.protocolId)}
    >
      {inner}
    </button>
  ) : (
    <div className="chat-msg__quote" aria-label={`${strings.timeline.inReplyTo} ${sender}`}>
      {inner}
    </div>
  );
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
 * messages collapsed under one header. Text is linkified but never auto-navigated. A reply shows a
 * one-line quote of its original when that original is in the loaded window.
 */
export function MessageTimeline({
  messages,
  lastReadId = null,
  now = Date.now(),
  isOwn,
  onOpenLink,
  resolveMedia,
  onOpenMedia,
  onJumpToMessage,
  groupWindowMs,
  maxMessages = TIMELINE_WINDOW,
}: Readonly<MessageTimelineProps>) {
  const s = useT(chatUiDict);
  const locale = useLocale();
  const items = buildTimeline(messages, {
    lastReadId,
    maxMessages,
    ...(groupWindowMs !== undefined ? { groupWindowMs } : {}),
  });
  const byProtocolId = new Map(messages.map((m) => [m.protocolId, m]));

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
        if (item.kind === 'truncated') {
          return (
            <li key={item.key} className="chat-timeline__truncated" role="separator">
              {item.hiddenCount} {s.timeline.earlierHidden}
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
                {!own && (
                  <Avatar name={senderName} seed={message.senderAddress || senderName} size="sm" />
                )}
                <span className="chat-msg__sender">{senderName}</span>
                <time className="chat-msg__time">
                  {formatClockTime(message.originTs || message.receivedAt, locale)}
                </time>
              </span>
            )}
            {message.replyToId !== null && byProtocolId.has(message.replyToId) && (
              <QuotedReply
                original={byProtocolId.get(message.replyToId)!}
                strings={s}
                onJump={onJumpToMessage}
              />
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
