import { describe, expect, it } from 'vitest';
import { decideUnload, LEAVE_GRACE_MS } from './unload-policy';

/**
 * The only rule with teeth here is the anti-trap one: a page must not be able to keep asking until the
 * user gives up. Everything else is a straight pass-through.
 */
describe('decideUnload', () => {
  it('asks the user on a page that has never been answered', () => {
    expect(decideUnload({ agentDriven: false, leftAt: null }, 1_000)).toBe('prompt');
  });

  it('does not ask on a tab an agent is driving — there is nobody to show a modal to', () => {
    expect(decideUnload({ agentDriven: true, leftAt: null }, 1_000)).toBe('allow');
  });

  it('stays silent for the grace window after the user said leave', () => {
    // A single navigation can raise the event more than once (a redirect chain, a same-document
    // handler re-firing). Asking again for the SAME departure is the captive-tab bug.
    expect(decideUnload({ agentDriven: false, leftAt: 1_000 }, 1_000)).toBe('allow');
    expect(decideUnload({ agentDriven: false, leftAt: 1_000 }, 1_000 + LEAVE_GRACE_MS - 1)).toBe(
      'allow',
    );
  });

  it('asks again once the grace window has passed — a later edit deserves its own warning', () => {
    expect(decideUnload({ agentDriven: false, leftAt: 1_000 }, 1_000 + LEAVE_GRACE_MS)).toBe(
      'prompt',
    );
    expect(decideUnload({ agentDriven: false, leftAt: 1_000 }, 60_000)).toBe('prompt');
  });

  it('is not fooled by a clock that went backwards', () => {
    // `Date.now()` can step back over an NTP correction. A negative elapsed must not read as "inside
    // the window" and silence a real warning — it reads as prompt, which is the safe side.
    expect(decideUnload({ agentDriven: false, leftAt: 10_000 }, 1_000)).toBe('prompt');
  });

  it('grants the agent precedence over an expired grace window', () => {
    expect(decideUnload({ agentDriven: true, leftAt: 1 }, 10_000_000)).toBe('allow');
  });
});
