import { describe, it, expect } from 'vitest';
import { PresenceTracker } from './presence';

describe('PresenceTracker', () => {
  it('an unknown contact is offline', () => {
    const t = new PresenceTracker();
    expect(t.effective('bob@x.com')).toEqual({ presence: 'offline', statusText: '' });
    expect(t.resourceCount('bob@x.com')).toBe(0);
  });

  it('folds one resource; accepts a bare or full JID for the query', () => {
    const t = new PresenceTracker();
    t.apply('bob@x.com/phone', 'away', 'brb');
    expect(t.effective('bob@x.com')).toEqual({ presence: 'away', statusText: 'brb' });
    expect(t.effective('bob@x.com/anything')).toEqual({ presence: 'away', statusText: 'brb' });
    expect(t.resourceCount('bob@x.com')).toBe(1);
  });

  it('picks the highest-priority resource', () => {
    const t = new PresenceTracker();
    t.apply('bob@x.com/phone', 'away', 'phone', 1);
    t.apply('bob@x.com/desktop', 'dnd', 'working', 5);
    expect(t.effective('bob@x.com')).toEqual({ presence: 'dnd', statusText: 'working' });
  });

  it('breaks a priority tie by availability (online > away > xa > dnd)', () => {
    const t = new PresenceTracker();
    t.apply('bob@x.com/a', 'dnd', 'a', 0);
    t.apply('bob@x.com/b', 'online', 'b', 0);
    t.apply('bob@x.com/c', 'xa', 'c', 0);
    expect(t.effective('bob@x.com')).toEqual({ presence: 'online', statusText: 'b' });
  });

  it('a resource going offline is removed; the contact stays online via its other resources', () => {
    const t = new PresenceTracker();
    t.apply('bob@x.com/phone', 'online', 'p');
    t.apply('bob@x.com/desktop', 'away', 'd');
    t.apply('bob@x.com/phone', 'offline');
    expect(t.resourceCount('bob@x.com')).toBe(1);
    expect(t.effective('bob@x.com')).toEqual({ presence: 'away', statusText: 'd' });
  });

  it('the last resource going offline drops the contact entirely', () => {
    const t = new PresenceTracker();
    t.apply('bob@x.com/only', 'online');
    t.apply('bob@x.com/only', 'offline');
    expect(t.resourceCount('bob@x.com')).toBe(0);
    expect(t.onlineContacts()).toEqual([]);
    expect(t.effective('bob@x.com').presence).toBe('offline');
    // an offline for an already-unknown resource is a no-op
    t.apply('bob@x.com/gone', 'offline');
    expect(t.resourceCount('bob@x.com')).toBe(0);
  });

  it('handles a bare-JID presence (no resource)', () => {
    const t = new PresenceTracker();
    t.apply('room@conf.x.com', 'online', 'topic');
    expect(t.effective('room@conf.x.com')).toEqual({ presence: 'online', statusText: 'topic' });
  });

  it('applyEvent maps a normalized presence event; status is length-capped', () => {
    const t = new PresenceTracker();
    t.applyEvent({ address: 'bob@x.com/p', presence: 'dnd', statusText: 'x'.repeat(600) });
    expect(t.effective('bob@x.com').statusText.length).toBe(512);
    t.applyEvent({ address: 'bob@x.com/p', presence: 'online' });
    expect(t.effective('bob@x.com')).toEqual({ presence: 'online', statusText: '' });
  });

  it('ignores an unparseable address', () => {
    const t = new PresenceTracker();
    t.apply('', 'online');
    t.apply('@nohost', 'online');
    expect(t.onlineContacts()).toEqual([]);
  });

  it('clear() forgets one contact or all', () => {
    const t = new PresenceTracker();
    t.apply('a@x.com/1', 'online');
    t.apply('b@x.com/1', 'online');
    t.clear('a@x.com');
    expect(t.onlineContacts()).toEqual(['b@x.com']);
    t.clear('unknown@x.com'); // no-op
    t.clear();
    expect(t.onlineContacts()).toEqual([]);
  });
});
