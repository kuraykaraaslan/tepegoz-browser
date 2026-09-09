import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useT } from '@tepegoz/i18n/react';
import { chatUiDict } from './i18n';
import {
  CHAT_COMPOSER_WARN_REMAINING,
  canSend,
  draftToBody,
  isOverLimit,
  isSendKey,
  remainingChars,
} from './composer-draft';

/** What the composer hands back on submit — the panel maps this to `sendChatMessage` / `editMessage`. */
export interface ComposerSubmission {
  text: string;
  replyToId: string | null;
  editMessageId: string | null;
}

export interface ComposerProps {
  onSubmit: (draft: ComposerSubmission) => void | Promise<void>;
  disabled?: boolean;
  placeholder?: string;
  /** Show a "replying to <author>" banner; the id rides along on the next submit. */
  replyingTo?: { messageId: string; author: string } | null;
  /** Seed the field with an existing message's text and submit as an edit of `messageId`. */
  editing?: { messageId: string; body: string } | null;
  /** Clear the reply / edit context (banner ✕, Escape). */
  onCancelContext?: () => void;
}

export function Composer({
  onSubmit,
  disabled = false,
  placeholder,
  replyingTo = null,
  editing = null,
  onCancelContext,
}: Readonly<ComposerProps>) {
  const s = useT(chatUiDict);
  const [text, setText] = useState('');
  const composing = useRef(false);

  // Seed / reseed the field whenever an edit target changes; leaving edit mode clears it.
  useEffect(() => {
    setText(editing?.body ?? '');
  }, [editing?.messageId, editing?.body]);

  const hasContext = replyingTo !== null || editing !== null;
  const over = isOverLimit(text);
  const remaining = remainingChars(text);

  const submit = (): void => {
    if (disabled || !canSend(text)) return;
    const body = draftToBody(text);
    if (body === null) return;
    void onSubmit({
      text: body,
      replyToId: replyingTo?.messageId ?? null,
      editMessageId: editing?.messageId ?? null,
    });
    setText('');
    onCancelContext?.();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (e.key === 'Escape' && hasContext) {
      onCancelContext?.();
      return;
    }
    const sendKey = isSendKey({
      key: e.key,
      shiftKey: e.shiftKey,
      altKey: e.altKey,
      ctrlKey: e.ctrlKey,
      metaKey: e.metaKey,
      isComposing: composing.current || e.nativeEvent.isComposing,
    });
    if (sendKey) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <form
      className="chat-composer"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      {hasContext && (
        <div className="chat-composer__context">
          <span className="chat-composer__context-label">
            {editing !== null
              ? s.composer.editing
              : `${s.composer.replyingTo} ${replyingTo?.author ?? ''}`}
          </span>
          <button
            type="button"
            className="chat-composer__context-cancel"
            onClick={() => onCancelContext?.()}
          >
            {s.composer.cancel}
          </button>
        </div>
      )}

      <div className="chat-composer__row">
        <textarea
          className="chat-composer__input"
          value={text}
          placeholder={placeholder ?? s.composer.placeholder}
          disabled={disabled}
          aria-invalid={over}
          rows={1}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          onCompositionStart={() => {
            composing.current = true;
          }}
          onCompositionEnd={() => {
            composing.current = false;
          }}
        />
        <button
          type="submit"
          className="chat-composer__send"
          disabled={disabled || !canSend(text)}
        >
          {s.composer.send}
        </button>
      </div>

      {over && <p className="chat-composer__error">{s.composer.tooLong}</p>}
      {!over && remaining <= CHAT_COMPOSER_WARN_REMAINING && (
        <p className="chat-composer__count">{remaining}</p>
      )}
    </form>
  );
}
