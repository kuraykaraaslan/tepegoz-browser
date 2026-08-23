import { describe, expect, it } from 'vitest';
import { choiceLines, choiceSummary } from './panel-run-config';
import type { AgentModelChoice } from './types';

/** A stored-key entry as `buildAgentConfig` emits it (the picker lists KEYS, not providers). */
function key(over: Partial<AgentModelChoice> = {}): AgentModelChoice {
  return {
    id: 'k1',
    provider: 'openai',
    label: 'Work',
    providerLabel: 'OpenAI',
    last4: '8CQA',
    available: true,
    ...over,
  };
}

/** The same entry with no fingerprint — a legacy record, or the key-free on-device entry. */
function keyNoFingerprint(over: Partial<AgentModelChoice> = {}): AgentModelChoice {
  const { last4, ...rest } = key(over);
  void last4;
  return rest;
}

describe('picker entry labels', () => {
  it('leads with the key label and puts provider + fingerprint underneath', () => {
    expect(choiceLines(key())).toEqual({ title: 'Work', sub: 'OpenAI · …8CQA' });
  });

  it('tells two keys of one provider apart by their fingerprints', () => {
    const a = choiceLines(key({ id: 'k1', label: 'Work', last4: '8CQA' }));
    const b = choiceLines(key({ id: 'k2', label: 'Personal', last4: '11AB' }));
    expect(a).not.toEqual(b);
  });

  it('drops the duplicate when the key is named after its provider (no "OpenAI · OpenAI")', () => {
    expect(choiceLines(key({ label: 'OpenAI' }))).toEqual({ title: 'OpenAI', sub: '…8CQA' });
  });

  it('omits the fingerprint for a legacy record that never recorded one', () => {
    expect(choiceLines(keyNoFingerprint())).toEqual({ title: 'Work', sub: 'OpenAI' });
  });

  it('renders the on-device entry as model + provider, with no key fingerprint', () => {
    const local = keyNoFingerprint({
      id: 'local',
      provider: 'local',
      label: 'qwen2.5-7b-instruct',
      providerLabel: 'On-device',
    });
    expect(choiceSummary(local)).toBe('qwen2.5-7b-instruct · On-device');
  });

  it('summarises to the bare label when there is nothing to add', () => {
    expect(choiceSummary(keyNoFingerprint({ label: 'OpenAI' }))).toBe('OpenAI');
  });
});
