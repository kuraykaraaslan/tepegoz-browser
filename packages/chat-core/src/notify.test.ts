import { describe, expect, it } from 'vitest';
import { decideNotification, type NotifyContext } from './notify';

const base: NotifyContext = {
  isRoom: true,
  level: 'all',
  muted: false,
  fromSelf: false,
  selfNames: ['ada'],
  body: 'hello everyone',
};

const decide = (over: Partial<NotifyContext>) => decideNotification({ ...base, ...over });

describe('decideNotification', () => {
  it('never notifies for the user\'s own echo', () => {
    expect(decide({ fromSelf: true, body: '@ada ping' })).toEqual({ notify: false, reason: 'from-self' });
  });

  it('a direct nick mention always notifies — even muted, even "mentions", even "none"', () => {
    for (const over of [
      { level: 'none' as const },
      { level: 'mentions' as const },
      { muted: true },
    ]) {
      expect(decide({ ...over, body: 'hey ada can you look' })).toEqual({
        notify: true,
        reason: 'mention',
      });
    }
  });

  it('a room ping notifies at "all" / "mentions" but not "none"', () => {
    expect(decide({ level: 'all', body: '@here standup' })).toEqual({ notify: true, reason: 'room-ping' });
    expect(decide({ level: 'mentions', body: '@here standup' })).toEqual({
      notify: true,
      reason: 'room-ping',
    });
    expect(decide({ level: 'none', body: '@here standup' })).toEqual({
      notify: false,
      reason: 'level-none',
    });
  });

  it('a plain room message follows the level then the mute flag', () => {
    expect(decide({ level: 'all', body: 'just chatting' })).toEqual({ notify: true, reason: 'room-all' });
    expect(decide({ level: 'all', muted: true, body: 'just chatting' })).toEqual({
      notify: false,
      reason: 'muted',
    });
    expect(decide({ level: 'mentions', body: 'just chatting' })).toEqual({
      notify: false,
      reason: 'level-mentions',
    });
    expect(decide({ level: 'none', body: 'just chatting' })).toEqual({
      notify: false,
      reason: 'level-none',
    });
  });

  it('a DM notifies unless muted (level is ignored)', () => {
    expect(decide({ isRoom: false, level: 'none', body: 'hi' })).toEqual({
      notify: true,
      reason: 'direct-message',
    });
    expect(decide({ isRoom: false, muted: true, body: 'hi' })).toEqual({ notify: false, reason: 'muted' });
  });

  it('defaults a room with no level to "all"', () => {
    expect(
      decideNotification({
        isRoom: true,
        fromSelf: false,
        selfNames: ['ada'],
        body: 'yo',
      }),
    ).toEqual({ notify: true, reason: 'room-all' });
  });
});
