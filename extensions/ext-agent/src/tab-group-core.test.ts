import { describe, it, expect } from 'vitest';
import { createAgentSessionStore } from './tab-group-core';

describe('createAgentSessionStore', () => {
  it('creates a session on first access keyed to the agent group id', () => {
    const store = createAgentSessionStore();
    const s = store.get('g1');
    expect(s.tabGroupId).toBe('g1');
    expect(s.topicHint).toBe('');
    expect([...s.ownedTabIds]).toEqual([]);
  });

  it('setTopic trims and caps the hint to 60 chars', () => {
    const store = createAgentSessionStore();
    store.setTopic('g1', `  ${'x'.repeat(80)}  `);
    expect(store.get('g1').topicHint).toBe('x'.repeat(60));
  });

  it('resolveGroupName prefers an explicit name over the topic hint', () => {
    const store = createAgentSessionStore();
    store.setTopic('g1', 'Fallback Topic');
    expect(store.resolveGroupName('g1', '  Explicit  ')).toBe('Explicit');
    expect(store.resolveGroupName('g1', '   ')).toBe('Fallback Topic');
    expect(store.resolveGroupName('g1')).toBe('Fallback Topic');
  });

  it('reset drops the session so the next access starts fresh', () => {
    const store = createAgentSessionStore();
    store.get('g1').tabGroupId = 'grp-99';
    store.recordOwnedTab('g1', 'tab-1');
    store.reset('g1');
    expect(store.get('g1').tabGroupId).toBe('g1'); // recreated default
    expect(store.ownsTab('g1', 'tab-1')).toBe(false);
  });

  it('tracks tab ownership per agent session', () => {
    const store = createAgentSessionStore();
    store.recordOwnedTab('g1', 'tab-1');
    expect(store.ownsTab('g1', 'tab-1')).toBe(true);
    expect(store.ownsTab('g2', 'tab-1')).toBe(false);
    store.releaseOwnedTab('g1', 'tab-1');
    expect(store.ownsTab('g1', 'tab-1')).toBe(false);
  });
});
