import { describe, it, expect } from 'vitest';
import { serializeConversationLog, type Turn } from './panel-state';
import type { AgentEvent } from './types';

/** Build an AgentEvent with sane defaults for the fields the log doesn't vary. */
function ev(kind: AgentEvent['kind'], message: string, ts: number, detail?: string): AgentEvent {
  return { runId: 'run-1', groupId: 'g1', kind, message, ts, ...(detail !== undefined ? { detail } : {}) };
}

// A fixed epoch-ms so the UTC timestamps in the transcript are deterministic.
const T0 = Date.UTC(2026, 6, 8, 9, 30, 0); // 2026-07-08T09:30:00Z

describe('serializeConversationLog', () => {
  it('renders a header, each turn prompt, and every event in order', () => {
    const turns: Turn[] = [
      {
        id: 't1',
        prompt: 'Book me a table',
        runId: 'run-1',
        events: [
          ev('plan', 'Plan the booking', T0),
          ev('step_start', 'open restaurant page', T0 + 1000, 'https://example.test'),
          ev('done', 'Done — table booked', T0 + 2000),
        ],
      },
    ];
    const out = serializeConversationLog(turns, {
      exportedAt: T0,
      groupId: 'g1',
      provider: 'anthropic',
      autonomy: 'ask',
      effort: 'high',
      tokens: { inputTokens: 10, outputTokens: 5, totalTokens: 15, quota: 0, lifetimeTokens: 0 },
    });

    expect(out).toContain('# Tepegöz Agent — Chat Log');
    expect(out).toContain('- Group: g1');
    expect(out).toContain('- Provider: anthropic');
    expect(out).toContain('- Tokens: 15 (10 in / 5 out)');
    expect(out).toContain('## Turn 1');
    expect(out).toContain('Book me a table');
    // Event lines carry the kind label, a UTC clock, and the detail as a sub-bullet.
    expect(out).toContain('`[09:30:00] Plan` Plan the booking');
    expect(out).toContain('`[09:30:01] Step start` open restaurant page');
    expect(out).toContain('  - https://example.test');
    expect(out).toContain('`[09:30:02] Response` Done — table booked');
    // Ordering: plan precedes step precedes response.
    expect(out.indexOf('Plan the booking')).toBeLessThan(out.indexOf('open restaurant page'));
    expect(out.indexOf('open restaurant page')).toBeLessThan(out.indexOf('Done — table booked'));
  });

  it('handles an empty conversation and empty prompts/events gracefully', () => {
    expect(serializeConversationLog([], { exportedAt: T0, groupId: null })).toContain(
      '_No messages in this conversation._',
    );
    const out = serializeConversationLog(
      [{ id: 't1', prompt: '   ', runId: null, events: [] }],
      { exportedAt: T0, groupId: null },
    );
    expect(out).toContain('_(empty)_');
    expect(out).toContain('_No agent events recorded._');
    // Optional metadata is omitted when absent (no stray "Provider:" line).
    expect(out).not.toContain('- Provider:');
    expect(out).not.toContain('- Group:');
  });
});
