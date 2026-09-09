import { describe, expect, it } from 'vitest';
import { CHAT_MESSAGE_BODY_MAX } from '@tepegoz/shared-types';
import { canSend, draftToBody, isOverLimit, isSendKey, remainingChars } from './composer-draft';

const key = (over: Partial<Parameters<typeof isSendKey>[0]> = {}) => ({
  key: 'Enter',
  shiftKey: false,
  altKey: false,
  ctrlKey: false,
  metaKey: false,
  ...over,
});

describe('isSendKey', () => {
  it('plain Enter sends', () => {
    expect(isSendKey(key())).toBe(true);
  });

  it('modified Enter or a non-Enter key does not', () => {
    expect(isSendKey(key({ shiftKey: true }))).toBe(false);
    expect(isSendKey(key({ altKey: true }))).toBe(false);
    expect(isSendKey(key({ ctrlKey: true }))).toBe(false);
    expect(isSendKey(key({ metaKey: true }))).toBe(false);
    expect(isSendKey(key({ key: 'a' }))).toBe(false);
  });

  it('Enter during IME composition does not send', () => {
    expect(isSendKey(key({ isComposing: true }))).toBe(false);
  });
});

describe('draftToBody', () => {
  it('trims and rejects an empty / whitespace draft', () => {
    expect(draftToBody('  hi \n')).toBe('hi');
    expect(draftToBody('   \n\t ')).toBeNull();
    expect(draftToBody('')).toBeNull();
  });
});

describe('limit helpers', () => {
  it('remainingChars counts down from the protocol maximum', () => {
    expect(remainingChars('12345')).toBe(CHAT_MESSAGE_BODY_MAX - 5);
  });

  it('isOverLimit / canSend gate an over-long body', () => {
    const huge = 'x'.repeat(CHAT_MESSAGE_BODY_MAX + 1);
    expect(isOverLimit(huge)).toBe(true);
    expect(canSend(huge)).toBe(false);
    expect(canSend('ok')).toBe(true);
    expect(canSend('   ')).toBe(false);
  });
});
