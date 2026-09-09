import { CHAT_MESSAGE_BODY_MAX } from '@tepegoz/shared-types';

/**
 * The pure keyboard / draft rules behind `<Composer>`. Split out so "does this keystroke send?" and
 * "is this draft sendable?" are tested without a DOM.
 */

/** Remaining characters at which the composer starts showing a live counter. */
export const CHAT_COMPOSER_WARN_REMAINING = 280;

export interface SendKeyEvent {
  key: string;
  shiftKey: boolean;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  /** True while an IME candidate is open — Enter commits the candidate, it must not send. */
  isComposing?: boolean;
}

/** Plain Enter sends; Shift/Alt/Ctrl/Meta-Enter and Enter-during-IME insert a newline. */
export function isSendKey(event: SendKeyEvent): boolean {
  return (
    event.key === 'Enter' &&
    !event.shiftKey &&
    !event.altKey &&
    !event.ctrlKey &&
    !event.metaKey &&
    event.isComposing !== true
  );
}

/** The body to send, or `null` when the draft is empty / whitespace only. */
export function draftToBody(text: string): string | null {
  const trimmed = text.trim();
  return trimmed.length === 0 ? null : trimmed;
}

export function remainingChars(text: string): number {
  return CHAT_MESSAGE_BODY_MAX - text.length;
}

export function isOverLimit(text: string): boolean {
  return text.length > CHAT_MESSAGE_BODY_MAX;
}

/** A draft can be sent when it has non-whitespace content and is within the protocol body limit. */
export function canSend(text: string): boolean {
  return draftToBody(text) !== null && !isOverLimit(text);
}
