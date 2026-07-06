import { describe, expect, it } from 'vitest';
import { summarizeConversationPrompt, terminalStatusFromEvents } from './index';

describe('agent-history helpers', () => {
  it('normalizes prompt whitespace for title and preview', () => {
    expect(summarizeConversationPrompt('  hello\n\nworld  ').title).toBe('hello world');
  });

  it('maps terminal events to conversation status', () => {
    expect(terminalStatusFromEvents([{ runId: 'r', groupId: 'g', kind: 'done', message: 'ok', ts: 1 }])).toBe(
      'completed',
    );
    expect(terminalStatusFromEvents([{ runId: 'r', groupId: 'g', kind: 'error', message: 'no', ts: 1 }])).toBe(
      'error',
    );
  });
});
