import { describe, it, expect } from 'vitest';
import { isMention, scanMentions } from './mentions';

describe('scanMentions', () => {
  it('finds @name tokens and an IRC address prefix', () => {
    expect(scanMentions('hey @ada and @bob').names).toEqual(expect.arrayContaining(['ada', 'bob']));
    expect(scanMentions('ada: are you there').names).toContain('ada');
  });

  it('flags a room-wide ping', () => {
    expect(scanMentions('@here standup in 5').roomPing).toBe(true);
    expect(scanMentions('@channel please review').roomPing).toBe(true);
    expect(scanMentions('just a normal message').roomPing).toBe(false);
  });
});

describe('isMention', () => {
  it('true when a self name is @mentioned or addressed', () => {
    expect(isMention('hey @ada look at this', ['ada'])).toBe(true);
    expect(isMention('ada: ping', ['ada'])).toBe(true);
  });

  it('true for a standalone whole-word occurrence, false for a substring', () => {
    expect(isMention('I think ada is right', ['ada'])).toBe(true);
    expect(isMention('the badada pattern', ['ada'])).toBe(false);
  });

  it('is fold-insensitive (Turkish dotted/dotless i, accents)', () => {
    expect(isMention('merhaba İDA', ['ida'])).toBe(true);
    expect(isMention('selam ışık', ['isik'])).toBe(true);
  });

  it('room ping always counts; empty self names never do', () => {
    expect(isMention('@everyone lunch', ['ada'])).toBe(true);
    expect(isMention('@everyone lunch', [])).toBe(false);
  });
});
