import { useEffect, useLayoutEffect, useRef, useState } from 'react';
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
  /** Add / remove the local user's reaction on a message. Absent ⇒ reactions render read-only. */
  onReact?: (protocolId: string, emoji: string, on: boolean) => void;
  /** Start editing one of the local user's own messages. Absent, not `isOwn`, or a redacted /
   *  still-pending message ⇒ no Edit trigger renders. */
  onEdit?: (protocolId: string, body: string) => void;
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

/** A short, fixed quick-react set — not a full emoji picker, just the common few (Telegram's own
 *  default bar is the same idea). */
const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '👏'];

/** Not user-facing text — a fixed glyph, same convention as `ReactionsBar`'s literal "+". Rendered
 *  as an expression (not raw JSX text) since a non-ASCII symbol trips `i18next/no-literal-string`
 *  where a plain punctuation character wouldn't. */
const EDIT_GLYPH = '✎';

function ReactionsBar({
  message,
  strings,
  onReact,
}: Readonly<{
  message: ChatMessage;
  strings: ChatUiStrings;
  onReact: ((protocolId: string, emoji: string, on: boolean) => void) | undefined;
}>) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const wrapRef = useRef<HTMLSpanElement>(null);

  // A click anywhere outside the "+" button / open picker closes it — without this, it stayed open
  // until the user picked an emoji or clicked "+" again, unlike every native picker/menu convention.
  useEffect(() => {
    if (!pickerOpen) return;
    const onPointerDown = (e: PointerEvent): void => {
      if (wrapRef.current?.contains(e.target as Node) === false) setPickerOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [pickerOpen]);

  if (message.reactions.length === 0 && onReact === undefined) return null;
  return (
    <span className="chat-msg__reactions">
      {message.reactions.map((r) =>
        onReact === undefined ? (
          <span key={r.emoji} className="chat-msg__reaction" data-me={r.me}>
            {r.emoji} {r.count}
          </span>
        ) : (
          <button
            key={r.emoji}
            type="button"
            className="chat-msg__reaction"
            data-me={r.me}
            aria-pressed={r.me}
            onClick={() => onReact(message.protocolId, r.emoji, !r.me)}
          >
            {r.emoji} {r.count}
          </button>
        ),
      )}
      {onReact !== undefined && (
        <span className="chat-msg__react-add" ref={wrapRef}>
          <button
            type="button"
            className="chat-msg__reaction chat-msg__reaction--add"
            aria-label={strings.timeline.addReaction}
            aria-expanded={pickerOpen}
            onClick={() => setPickerOpen((v) => !v)}
          >
            +
          </button>
          {pickerOpen && (
            <span className="chat-msg__react-picker" role="menu">
              {QUICK_REACTIONS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    onReact(message.protocolId, emoji, true);
                    setPickerOpen(false);
                  }}
                >
                  {emoji}
                </button>
              ))}
            </span>
          )}
        </span>
      )}
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
  onReact,
  onEdit,
  groupWindowMs,
  maxMessages = TIMELINE_WINDOW,
}: Readonly<MessageTimelineProps>) {
  const s = useT(chatUiDict);
  const locale = useLocale();
  const listRef = useRef<HTMLOListElement>(null);
  // Position once per mount (the host keys this component by conversation id, so a conversation
  // switch remounts it) the first time messages actually arrive — history loads asynchronously, so
  // the initial render is often still empty.
  const positioned = useRef(false);
  // Whether the reader is close enough to the bottom that a new arrival should follow them there —
  // someone scrolled up mid-history must never get yanked back down by an unrelated incoming
  // message, but staying at the bottom (the common case) should keep tracking new messages live.
  const nearBottomRef = useRef(true);
  const lastSeenIdRef = useRef<string | null>(null);
  const items = buildTimeline(messages, {
    lastReadId,
    maxMessages,
    ...(groupWindowMs !== undefined ? { groupWindowMs } : {}),
  });
  const byProtocolId = new Map(messages.map((m) => [m.protocolId, m]));

  useEffect(() => {
    const el = listRef.current;
    if (el === null) return;
    const onScroll = (): void => {
      nearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    };
    el.addEventListener('scroll', onScroll);
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  useLayoutEffect(() => {
    const el = listRef.current;
    if (el === null || messages.length === 0) return;
    const last = messages[messages.length - 1];

    if (!positioned.current) {
      positioned.current = true;
      if (last !== undefined) lastSeenIdRef.current = last.protocolId;
      // Telegram-style: land on the unread divider when there is one, otherwise the newest message.
      const divider = el.querySelector('.chat-timeline__unread');
      if (divider !== null && typeof divider.scrollIntoView === 'function') {
        divider.scrollIntoView({ block: 'start' });
      } else {
        el.scrollTop = el.scrollHeight;
      }
      return;
    }

    // A later arrival — not the initial load. An edit/reaction/redaction never changes which
    // message is last, so this only fires for a genuinely new one.
    if (last === undefined || last.protocolId === lastSeenIdRef.current) return;
    lastSeenIdRef.current = last.protocolId;
    if ((isOwn?.(last) ?? false) || nearBottomRef.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages.length, isOwn]);

  if (items.length === 0) {
    return (
      <ol className="chat-timeline" ref={listRef}>
        <li className="chat-timeline__empty">{s.timeline.empty}</li>
      </ol>
    );
  }

  return (
    <ol className="chat-timeline" ref={listRef}>
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

        if (message.kind === 'system') {
          return (
            <li key={item.key} className="chat-msg" data-kind="system">
              <MessageBody message={message} strings={s} onOpenLink={onOpenLink} />
            </li>
          );
        }

        return (
          <li
            key={item.key}
            className="chat-msg"
            data-kind={message.kind}
            data-own={own}
            data-starts-group={startsGroup}
          >
            {!own && (
              <span className="chat-msg__gutter">
                {startsGroup && (
                  <span className="chat-msg__avatar-tip" title={senderName}>
                    <Avatar name={senderName} seed={message.senderAddress || senderName} size="sm" />
                    {/* The name is still in the accessibility tree — just not shown as its own
                     *  line, a hover tooltip on the avatar carries it visually instead. */}
                    <span className="chat-presence__sr-only">{senderName}</span>
                  </span>
                )}
              </span>
            )}
            <div className="chat-msg__bubble">
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
              <span className="chat-msg__foot">
                {own && (
                  <span className="chat-msg__delivery" data-state={message.deliveryState}>
                    {s.delivery[message.deliveryState]}
                  </span>
                )}
                <time className="chat-msg__time">
                  {formatClockTime(message.originTs || message.receivedAt, locale)}
                </time>
                {own &&
                  onEdit !== undefined &&
                  !message.redacted &&
                  (message.deliveryState === 'sent' ||
                    message.deliveryState === 'delivered' ||
                    message.deliveryState === 'read') && (
                    <button
                      type="button"
                      className="chat-msg__edit"
                      aria-label={s.timeline.edit}
                      onClick={() => onEdit(message.protocolId, message.body)}
                    >
                      {EDIT_GLYPH}
                    </button>
                  )}
              </span>
              <ReactionsBar message={message} strings={s} onReact={onReact} />
            </div>
          </li>
        );
      })}
    </ol>
  );
}
