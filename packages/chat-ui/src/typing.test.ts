import { describe, expect, it } from 'vitest';
import { roomTypingLabel, typingName } from './typing';

const s = { typingOne: 'is typing…', typingMany: 'are typing…', typingSeveral: 'Several people are typing…' };

describe('typingName', () => {
  it('takes the last path segment, falling back to the whole address', () => {
    expect(typingName('room@conf/Bea')).toBe('Bea');
    expect(typingName('#chan/bea')).toBe('bea');
    expect(typingName('bob@example.org')).toBe('bob@example.org');
    expect(typingName('')).toBe('');
  });
});

describe('roomTypingLabel', () => {
  it('is null when nobody is typing', () => {
    expect(roomTypingLabel([], s)).toBe(null);
  });
  it('names one typist', () => {
    expect(roomTypingLabel(['room@conf/Bea'], s)).toBe('Bea is typing…');
  });
  it('joins two typists', () => {
    expect(roomTypingLabel(['room@conf/Bea', 'room@conf/Cy'], s)).toBe('Bea & Cy are typing…');
  });
  it('collapses three or more to the generic line', () => {
    expect(roomTypingLabel(['a/x', 'a/y', 'a/z', 'a/w'], s)).toBe('Several people are typing…');
  });
});
